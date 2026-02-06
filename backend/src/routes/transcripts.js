import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { get, run, all } from '../db/database.js';

const router = express.Router();

// GET /api/transcripts - List all transcripts
router.get('/', async (req, res) => {
  try {
    const { deal_id, processed, search } = req.query;

    let sql = `
      SELECT t.*, d.company_name as deal_company, u.name as uploaded_by_name
      FROM transcripts t
      LEFT JOIN deals d ON t.deal_id = d.id
      LEFT JOIN users u ON t.uploaded_by = u.id
      WHERE 1=1
    `;
    const params = [];

    // Filter by deal
    if (deal_id) {
      sql += ' AND t.deal_id = ?';
      params.push(deal_id);
    }

    // Filter by processed status
    if (processed !== undefined) {
      sql += ' AND t.processed = ?';
      params.push(processed === 'true' ? 1 : 0);
    }

    // Search across transcript content (keyword search)
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      sql += ` AND (
        t.raw_content LIKE ? OR
        t.cleaned_content LIKE ? OR
        t.file_name LIKE ? OR
        d.company_name LIKE ? OR
        t.insights LIKE ?
      )`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // For non-admin/manager users, only show their own transcripts
    if (req.user.role === 'rep' || req.user.role === 'sdr' || req.user.role === 'ae') {
      sql += ' AND d.owner_id = ?';
      params.push(req.user.id);
    }

    sql += ' ORDER BY t.created_at DESC';

    const transcripts = await all(sql, params);

    res.json({ transcripts });
  } catch (error) {
    console.error('Error fetching transcripts:', error);
    res.status(500).json({ error: 'Failed to fetch transcripts' });
  }
});

// POST /api/transcripts/upload - Upload a transcript
router.post('/upload', async (req, res) => {
  try {
    const { deal_id, file_name, file_format, raw_content, source_platform } = req.body;

    // Validate required fields
    if (!deal_id) {
      return res.status(400).json({ error: 'Deal ID is required' });
    }

    if (!file_name) {
      return res.status(400).json({ error: 'File name is required' });
    }

    if (!raw_content) {
      return res.status(400).json({ error: 'Transcript content is required' });
    }

    // Check file size (10MB limit)
    const contentSize = Buffer.byteLength(raw_content, 'utf8');
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (contentSize > maxSize) {
      return res.status(400).json({ error: 'File size exceeds 10MB limit' });
    }

    // Verify deal exists
    const deal = await get('SELECT id, owner_id, company_name, stage FROM deals WHERE id = ?', [deal_id]);
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Check authorization
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && deal.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate file format
    const validFormats = ['txt', 'json', 'vtt'];
    const format = file_format || 'txt';
    if (!validFormats.includes(format)) {
      return res.status(400).json({ error: 'Invalid file format. Supported: txt, json, vtt' });
    }

    // Validate source platform
    const validPlatforms = ['fireflies', 'otter', 'zoom', 'google_meet', 'manual'];
    const platform = source_platform || 'manual';
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({ error: 'Invalid source platform' });
    }

    // Clean content (remove filler words)
    const cleanedContent = cleanTranscript(raw_content);

    const transcriptId = uuidv4();

    await run(
      `INSERT INTO transcripts (
        id, deal_id, file_name, file_format, raw_content, cleaned_content,
        source_platform, processed, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transcriptId,
        deal_id,
        file_name,
        format,
        raw_content,
        cleanedContent,
        platform,
        0,
        req.user.id
      ]
    );

    // Create activity log
    await run(
      `INSERT INTO activities (id, deal_id, activity_type, description, metadata, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        deal_id,
        'transcript_uploaded',
        `Transcript uploaded: ${file_name}`,
        JSON.stringify({ transcript_id: transcriptId, file_name, source_platform: platform }),
        req.user.id
      ]
    );

    // Update deal stage to discovery if it's in new_signal or qualified
    const earlyStages = ['new_signal', 'qualified'];
    if (earlyStages.includes(deal.stage)) {
      await run(
        'UPDATE deals SET stage = ?, updated_at = datetime("now") WHERE id = ?',
        ['discovery', deal_id]
      );

      // Log stage change
      await run(
        `INSERT INTO activities (id, deal_id, activity_type, description, metadata, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          deal_id,
          'stage_changed',
          'Stage auto-advanced to Discovery (transcript uploaded)',
          JSON.stringify({ from: deal.stage, to: 'discovery', reason: 'transcript_uploaded' }),
          req.user.id
        ]
      );
    }

    const transcript = await get(
      `SELECT t.*, d.company_name as deal_company
       FROM transcripts t
       LEFT JOIN deals d ON t.deal_id = d.id
       WHERE t.id = ?`,
      [transcriptId]
    );

    res.status(201).json({ transcript, message: 'Transcript uploaded successfully' });
  } catch (error) {
    console.error('Error uploading transcript:', error);
    res.status(500).json({ error: 'Failed to upload transcript' });
  }
});

// POST /api/transcripts/analyze - Analyze a transcript using Nessencja framework
router.post('/analyze', async (req, res) => {
  try {
    const { transcript_id } = req.body;

    if (!transcript_id) {
      return res.status(400).json({ error: 'Transcript ID is required' });
    }

    const transcript = await get(
      `SELECT t.*, d.owner_id
       FROM transcripts t
       LEFT JOIN deals d ON t.deal_id = d.id
       WHERE t.id = ?`,
      [transcript_id]
    );

    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    // Check authorization
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && transcript.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Extract insights using Nessencja framework (Pain/Power/Risk/Next Steps)
    const content = transcript.cleaned_content || transcript.raw_content || '';
    const insights = extractNessencjaInsights(content);

    await run(
      `UPDATE transcripts
       SET processed = 1, insights = ?, processed_at = datetime("now")
       WHERE id = ?`,
      [JSON.stringify(insights), transcript_id]
    );

    // Create activity log
    await run(
      `INSERT INTO activities (id, deal_id, activity_type, description, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), transcript.deal_id, 'transcript_analyzed', 'Transcript analysis completed (Nessencja framework)', req.user.id]
    );

    const updatedTranscript = await get('SELECT * FROM transcripts WHERE id = ?', [transcript_id]);

    res.json({
      transcript: updatedTranscript,
      insights: insights,
      message: 'Transcript analysis complete using Nessencja framework'
    });
  } catch (error) {
    console.error('Error analyzing transcript:', error);
    res.status(500).json({ error: 'Failed to analyze transcript' });
  }
});

// Helper function to extract financial data for ROI calculation
function extractFinancialData(content) {
  const financialPains = [];

  // Common patterns for financial losses/costs
  const patterns = [
    // Match dollar amounts with context: "losing $50k monthly", "costs $100,000", etc.
    /(?:los(?:ing|t|es?)|cost(?:s|ing)?|spend(?:s|ing)?|wast(?:e|ing)|pay(?:s|ing)?)\s+(?:around\s+|about\s+|approximately\s+)?[\$€£]?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?:k|m|K|M)?)\s*(?:per\s+)?(month(?:ly)?|year(?:ly)?|week(?:ly)?|day|hour|annually)?/gi,
    // Match "costs us X", "spending X"
    /(?:cost(?:s|ing)?\s+us|we\s+(?:spend|lose|pay|waste))\s+(?:around\s+|about\s+)?[\$€£]?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?:k|m|K|M)?)\s*(?:per\s+)?(month(?:ly)?|year(?:ly)?|week(?:ly)?|day|hour)?/gi,
    // Match "X in losses", "X per month in costs"
    /[\$€£]?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?:k|m|K|M)?)\s*(?:per\s+)?(month(?:ly)?|year(?:ly)?|week(?:ly)?)?\s+(?:in\s+)?(?:loss(?:es)?|cost(?:s)?|damage)/gi,
    // Match direct amounts with time: "$50k monthly", "100k per year"
    /[\$€£](\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?:k|m|K|M)?)\s*(?:per\s+)?(month(?:ly)?|year(?:ly)?|week(?:ly)?|annually)/gi,
    // Match percentages in context: "losing 30% of revenue"
    /(?:los(?:ing|t)|waste|down)\s+(\d{1,3})%\s+(?:of\s+)?(?:revenue|profit|productivity|efficiency|sales)/gi
  ];

  const lines = content.split(/[\n.!?]+/);

  for (const line of lines) {
    for (const pattern of patterns) {
      // Reset regex lastIndex
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const amount = match[1];
        const period = match[2] || 'monthly';

        // Normalize the amount
        let numericValue = parseFloat(amount.replace(/[$€£,]/g, ''));
        const suffix = amount.toLowerCase().slice(-1);
        if (suffix === 'k') numericValue *= 1000;
        if (suffix === 'm') numericValue *= 1000000;

        // Normalize period to monthly
        let monthlyValue = numericValue;
        const periodLower = period.toLowerCase();
        if (periodLower.includes('year') || periodLower.includes('annual')) {
          monthlyValue = numericValue / 12;
        } else if (periodLower.includes('week')) {
          monthlyValue = numericValue * 4.33;
        } else if (periodLower === 'day' || periodLower === 'daily') {
          monthlyValue = numericValue * 22; // Business days
        }

        // Only include significant amounts
        if (monthlyValue >= 1000) {
          financialPains.push({
            rawText: line.trim().substring(0, 200),
            amount: numericValue,
            period: period,
            monthlyValue: Math.round(monthlyValue),
            yearlyValue: Math.round(monthlyValue * 12)
          });
        }
      }
    }
  }

  // Remove duplicates and sort by value
  const uniquePains = financialPains
    .filter((pain, index, self) =>
      index === self.findIndex(p => p.monthlyValue === pain.monthlyValue)
    )
    .sort((a, b) => b.yearlyValue - a.yearlyValue)
    .slice(0, 5);

  // Calculate totals
  const totalMonthly = uniquePains.reduce((sum, p) => sum + p.monthlyValue, 0);
  const totalYearly = uniquePains.reduce((sum, p) => sum + p.yearlyValue, 0);

  return {
    pains: uniquePains,
    totalMonthlyLoss: totalMonthly,
    totalYearlyLoss: totalYearly,
    // Estimated ROI assuming 50% cost recovery
    estimatedMonthlySavings: Math.round(totalMonthly * 0.5),
    estimatedYearlySavings: Math.round(totalYearly * 0.5),
    hasFinancialData: uniquePains.length > 0
  };
}

// Helper function to extract insights using Nessencja framework
function extractNessencjaInsights(content) {
  const lowerContent = content.toLowerCase();
  const lines = content.split(/[\n.!?]+/).filter(line => line.trim().length > 10);

  // Extract financial data for ROI calculation
  const financialData = extractFinancialData(content);

  // Pain Points extraction - look for problem/challenge indicators
  const painKeywords = ['challenge', 'problem', 'issue', 'struggle', 'difficult', 'pain', 'frustrat', 'concern', 'worry', 'need', 'want', 'lack', 'missing', 'slow', 'expensive', 'costly', 'manual', 'inefficient'];
  const painPoints = lines
    .filter(line => painKeywords.some(keyword => line.toLowerCase().includes(keyword)))
    .slice(0, 5)
    .map(line => line.trim().substring(0, 200));

  // Stakeholders extraction - look for names and roles
  const roleKeywords = ['ceo', 'cto', 'cfo', 'coo', 'vp', 'director', 'manager', 'head of', 'lead', 'chief', 'president', 'owner', 'founder', 'decision maker', 'stakeholder'];
  const stakeholders = [];
  const namePattern = /(?:I'm|I am|this is|my name is|speaking with|talking to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;
  const speakerPattern = /^([A-Z][a-z]+):/gm;

  // Extract speaker names from transcript format
  const speakerMatches = content.match(speakerPattern) || [];
  const uniqueSpeakers = [...new Set(speakerMatches.map(s => s.replace(':', '')))];
  uniqueSpeakers.forEach(name => {
    stakeholders.push({ name, role: 'Participant', influence: 'medium' });
  });

  // Look for role mentions
  lines.forEach(line => {
    roleKeywords.forEach(role => {
      if (line.toLowerCase().includes(role)) {
        const roleMatch = line.match(new RegExp(`(\\w+)\\s+(?:is|as)?\\s*(?:the|our)?\\s*${role}`, 'i'));
        if (roleMatch && roleMatch[1]) {
          const existingIdx = stakeholders.findIndex(s => s.name.toLowerCase() === roleMatch[1].toLowerCase());
          if (existingIdx >= 0) {
            stakeholders[existingIdx].role = role.charAt(0).toUpperCase() + role.slice(1);
            stakeholders[existingIdx].influence = 'high';
          }
        }
      }
    });
  });

  // Red Flags extraction - look for warning signs
  const redFlagKeywords = ['budget', 'timeline', 'competitor', 'delay', 'postpone', 'not sure', 'uncertain', 'hesitat', 'concern', 'risk', 'legal', 'compliance', 'approval', 'committee', 'evaluate', 'other options', 'alternatives', 'not ready', 'later', 'maybe', 'possibly'];
  const redFlags = lines
    .filter(line => redFlagKeywords.some(keyword => line.toLowerCase().includes(keyword)))
    .slice(0, 5)
    .map(line => line.trim().substring(0, 200));

  // Next Steps extraction - look for action items
  const nextStepKeywords = ['schedule', 'meeting', 'call', 'demo', 'follow up', 'send', 'share', 'review', 'discuss', 'next step', 'action', 'proposal', 'quote', 'trial', 'pilot', 'poc', 'let\'s', 'we should', 'we\'ll', 'i\'ll', 'will'];
  const nextSteps = lines
    .filter(line => nextStepKeywords.some(keyword => line.toLowerCase().includes(keyword)))
    .slice(0, 5)
    .map(line => line.trim().substring(0, 200));

  // Ensure we have at least some content in each section
  return {
    pain_points: painPoints.length > 0 ? painPoints : ['No specific pain points identified - review transcript manually'],
    stakeholders: stakeholders.length > 0 ? stakeholders.slice(0, 5) : [{ name: 'Unknown', role: 'Contact', influence: 'medium' }],
    red_flags: redFlags.length > 0 ? redFlags : ['No red flags detected'],
    next_steps: nextSteps.length > 0 ? nextSteps : ['Schedule follow-up discussion to clarify requirements'],
    financial_data: financialData
  };
}

// GET /api/transcripts/:id - Get a specific transcript
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const transcript = await get(
      `SELECT t.*, d.company_name as deal_company, d.owner_id, u.name as uploaded_by_name
       FROM transcripts t
       LEFT JOIN deals d ON t.deal_id = d.id
       LEFT JOIN users u ON t.uploaded_by = u.id
       WHERE t.id = ?`,
      [id]
    );

    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    // Check authorization
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && transcript.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Parse insights if present
    if (transcript.insights) {
      transcript.insights = JSON.parse(transcript.insights);
    }

    res.json({ transcript });
  } catch (error) {
    console.error('Error fetching transcript:', error);
    res.status(500).json({ error: 'Failed to fetch transcript' });
  }
});

// PUT /api/transcripts/:id - Update transcript insights
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { insights } = req.body;

    const transcript = await get(
      `SELECT t.*, d.owner_id
       FROM transcripts t
       LEFT JOIN deals d ON t.deal_id = d.id
       WHERE t.id = ?`,
      [id]
    );

    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    // Check authorization
    if (req.user.role !== 'admin' && transcript.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (insights) {
      await run(
        'UPDATE transcripts SET insights = ? WHERE id = ?',
        [JSON.stringify(insights), id]
      );
    }

    const updatedTranscript = await get('SELECT * FROM transcripts WHERE id = ?', [id]);
    if (updatedTranscript.insights) {
      updatedTranscript.insights = JSON.parse(updatedTranscript.insights);
    }

    res.json({ transcript: updatedTranscript, message: 'Transcript updated successfully' });
  } catch (error) {
    console.error('Error updating transcript:', error);
    res.status(500).json({ error: 'Failed to update transcript' });
  }
});

// DELETE /api/transcripts/:id - Delete a transcript
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const transcript = await get(
      `SELECT t.*, d.owner_id
       FROM transcripts t
       LEFT JOIN deals d ON t.deal_id = d.id
       WHERE t.id = ?`,
      [id]
    );

    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    // Check authorization
    if (req.user.role !== 'admin' && transcript.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await run('DELETE FROM transcripts WHERE id = ?', [id]);

    res.json({ message: 'Transcript deleted successfully' });
  } catch (error) {
    console.error('Error deleting transcript:', error);
    res.status(500).json({ error: 'Failed to delete transcript' });
  }
});

// Helper function to clean transcript content
function cleanTranscript(content) {
  // Remove common filler words
  const fillerPatterns = [
    /\b(um+|uh+|hmm+|yyy+|eee+|err+|ah+)\b/gi,
    /\b(you know|like,|basically,|actually,|literally,|I mean,)\b/gi,
    /\s+/g // Normalize whitespace
  ];

  let cleaned = content;
  fillerPatterns.forEach(pattern => {
    if (pattern.source === '\\s+') {
      cleaned = cleaned.replace(pattern, ' ');
    } else {
      cleaned = cleaned.replace(pattern, '');
    }
  });

  return cleaned.trim();
}

export default router;
