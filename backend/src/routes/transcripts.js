import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { get, run, all } from '../db/database.js';

const router = express.Router();

// GET /api/transcripts - List all transcripts
router.get('/', async (req, res) => {
  try {
    const { deal_id, processed } = req.query;

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
    const deal = await get('SELECT id, owner_id, company_name FROM deals WHERE id = ?', [deal_id]);
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

// POST /api/transcripts/analyze - Analyze a transcript (placeholder for AI)
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

    // For now, create placeholder insights
    // In production, this would call the AI agent to analyze the transcript
    const placeholderInsights = {
      pain_points: ['Analysis requires AI integration'],
      stakeholders: [],
      red_flags: [],
      next_steps: ['Complete AI integration for full analysis']
    };

    await run(
      `UPDATE transcripts
       SET processed = 1, insights = ?, processed_at = datetime("now")
       WHERE id = ?`,
      [JSON.stringify(placeholderInsights), transcript_id]
    );

    // Create activity log
    await run(
      `INSERT INTO activities (id, deal_id, activity_type, description, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), transcript.deal_id, 'transcript_analyzed', 'Transcript analysis completed', req.user.id]
    );

    const updatedTranscript = await get('SELECT * FROM transcripts WHERE id = ?', [transcript_id]);

    res.json({
      transcript: updatedTranscript,
      insights: placeholderInsights,
      message: 'Transcript analysis complete (placeholder - AI integration required)'
    });
  } catch (error) {
    console.error('Error analyzing transcript:', error);
    res.status(500).json({ error: 'Failed to analyze transcript' });
  }
});

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
