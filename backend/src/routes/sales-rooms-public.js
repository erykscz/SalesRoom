import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { get, run, all } from '../db/database.js';
import { sendSalesRoomViewNotification, sendSectionViewNotification } from '../utils/slack.js';

const router = express.Router();

// GET /api/sales-rooms/public/:slug - Public access for clients (NO AUTH REQUIRED)
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { role, password } = req.query;

    const salesRoom = await get(
      `SELECT sr.*, d.company_name as deal_company,
              u.name as creator_name, u.email as creator_email,
              u.phone as creator_phone, u.job_title as creator_job_title,
              u.avatar_url as creator_avatar_url
       FROM sales_rooms sr
       LEFT JOIN deals d ON sr.deal_id = d.id
       LEFT JOIN users u ON sr.created_by = u.id
       WHERE sr.public_url_slug = ?`,
      [slug]
    );

    if (!salesRoom) {
      return res.status(404).json({ error: 'Sales Room not found' });
    }

    // Check if expired
    if (salesRoom.is_expired) {
      return res.status(410).json({ error: 'This Sales Room has expired' });
    }

    if (salesRoom.expires_at && new Date(salesRoom.expires_at) < new Date()) {
      // Mark as expired
      await run('UPDATE sales_rooms SET is_expired = 1 WHERE id = ?', [salesRoom.id]);
      return res.status(410).json({ error: 'This Sales Room has expired' });
    }

    // Check password protection
    if (salesRoom.password_protected) {
      if (!password) {
        return res.status(401).json({ error: 'Password required', passwordRequired: true });
      }
      const bcrypt = await import('bcryptjs');
      const validPassword = bcrypt.default.compareSync(password, salesRoom.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid password' });
      }
    }

    // Log analytics
    await run(
      `INSERT INTO sales_room_analytics (id, sales_room_id, visitor_role, section_viewed, time_spent_seconds)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), salesRoom.id, role || null, 'overview', 0]
    );

    // Send Slack notification when client opens the Sales Room (async, don't await)
    sendSalesRoomViewNotification(salesRoom, role).catch(err => {
      console.error('Failed to send Slack notification:', err);
    });

    // Parse JSON fields
    if (salesRoom.sections) {
      salesRoom.sections = JSON.parse(salesRoom.sections);
    }
    if (salesRoom.branding) {
      salesRoom.branding = JSON.parse(salesRoom.branding);
    }
    if (salesRoom.mutual_action_plan) {
      salesRoom.mutual_action_plan = JSON.parse(salesRoom.mutual_action_plan);
    }

    // Fetch financial data from transcripts for auto-ROI calculation
    let financialData = null;
    if (salesRoom.deal_id) {
      const transcripts = await all(
        `SELECT insights FROM transcripts WHERE deal_id = ? AND processed = 1 AND insights IS NOT NULL`,
        [salesRoom.deal_id]
      );

      // Aggregate financial data from all transcripts
      const aggregatedFinancials = {
        pains: [],
        totalMonthlyLoss: 0,
        totalYearlyLoss: 0,
        estimatedMonthlySavings: 0,
        estimatedYearlySavings: 0,
        hasFinancialData: false
      };

      for (const t of transcripts) {
        try {
          const insights = JSON.parse(t.insights);
          if (insights.financial_data && insights.financial_data.hasFinancialData) {
            aggregatedFinancials.hasFinancialData = true;
            aggregatedFinancials.pains = aggregatedFinancials.pains.concat(insights.financial_data.pains || []);
            aggregatedFinancials.totalMonthlyLoss += insights.financial_data.totalMonthlyLoss || 0;
            aggregatedFinancials.totalYearlyLoss += insights.financial_data.totalYearlyLoss || 0;
            aggregatedFinancials.estimatedMonthlySavings += insights.financial_data.estimatedMonthlySavings || 0;
            aggregatedFinancials.estimatedYearlySavings += insights.financial_data.estimatedYearlySavings || 0;
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }

      if (aggregatedFinancials.hasFinancialData) {
        // Deduplicate pains by monthlyValue
        const uniquePains = aggregatedFinancials.pains.filter((pain, index, self) =>
          index === self.findIndex(p => p.monthlyValue === pain.monthlyValue)
        ).slice(0, 5);

        financialData = {
          ...aggregatedFinancials,
          pains: uniquePains,
          // Calculate 3-year ROI projection
          threeYearSavings: Math.round(aggregatedFinancials.estimatedYearlySavings * 3),
          roiPercentage: aggregatedFinancials.totalYearlyLoss > 0
            ? Math.round((aggregatedFinancials.estimatedYearlySavings / (aggregatedFinancials.totalYearlyLoss * 0.3)) * 100)
            : 0
        };
      }
    }

    // Attach financial data to salesRoom for frontend
    salesRoom.roiData = financialData;

    // Add attachment URL if exists - use proxy endpoint for secure access
    if (salesRoom.attachment_filename && salesRoom.attachment_path) {
      salesRoom.attachment_url = `/api/sales-rooms/public/${slug}/attachment`;
    }

    // Remove sensitive fields
    delete salesRoom.password_hash;
    delete salesRoom.created_by;
    delete salesRoom.attachment_path;

    res.json({ salesRoom });
  } catch (error) {
    console.error('Error fetching public sales room:', error);
    res.status(500).json({ error: 'Failed to fetch sales room' });
  }
});

// PATCH /api/sales-rooms/public/:slug/map/:itemId - Update MAP item completion status (NO AUTH REQUIRED)
router.patch('/:slug/map/:itemId', async (req, res) => {
  try {
    const { slug, itemId } = req.params;
    const { completed } = req.body;

    const salesRoom = await get(
      'SELECT id, is_expired, mutual_action_plan FROM sales_rooms WHERE public_url_slug = ?',
      [slug]
    );

    if (!salesRoom) {
      return res.status(404).json({ error: 'Sales Room not found' });
    }

    if (salesRoom.is_expired) {
      return res.status(410).json({ error: 'This Sales Room has expired' });
    }

    if (!salesRoom.mutual_action_plan) {
      return res.status(400).json({ error: 'No Mutual Action Plan found' });
    }

    // Parse existing MAP
    const mapItems = JSON.parse(salesRoom.mutual_action_plan);

    // Find and update the specific item
    const itemIndex = mapItems.findIndex((item) => item.id === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'MAP item not found' });
    }

    // Only allow updating client tasks
    if (mapItems[itemIndex].owner !== 'client') {
      return res.status(403).json({ error: 'Can only update client tasks' });
    }

    // Update the completion status
    mapItems[itemIndex].completed = completed === true;

    // Save back to database
    await run(
      'UPDATE sales_rooms SET mutual_action_plan = ?, updated_at = datetime("now") WHERE id = ?',
      [JSON.stringify(mapItems), salesRoom.id]
    );

    // Log analytics for MAP interaction
    await run(
      `INSERT INTO sales_room_analytics (id, sales_room_id, visitor_role, section_viewed, time_spent_seconds)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), salesRoom.id, null, 'map', 0]
    );

    res.json({
      success: true,
      message: 'MAP item updated',
      item: mapItems[itemIndex]
    });
  } catch (error) {
    console.error('Error updating MAP item:', error);
    res.status(500).json({ error: 'Failed to update MAP item' });
  }
});

// POST /api/sales-rooms/public/:slug/poll - Submit poll response (NO AUTH REQUIRED)
router.post('/:slug/poll', async (req, res) => {
  try {
    const { slug } = req.params;
    const { response, feedback, role } = req.body;

    const salesRoom = await get(
      'SELECT id, is_expired, poll_enabled, poll_question FROM sales_rooms WHERE public_url_slug = ?',
      [slug]
    );

    if (!salesRoom) {
      return res.status(404).json({ error: 'Sales Room not found' });
    }

    if (salesRoom.is_expired) {
      return res.status(410).json({ error: 'This Sales Room has expired' });
    }

    if (!salesRoom.poll_enabled) {
      return res.status(400).json({ error: 'Poll is not enabled for this Sales Room' });
    }

    if (!response) {
      return res.status(400).json({ error: 'Response is required' });
    }

    // Validate response
    const validResponses = ['yes', 'partially', 'no'];
    if (!validResponses.includes(response)) {
      return res.status(400).json({ error: 'Invalid response. Must be yes, partially, or no' });
    }

    // Insert poll response
    await run(
      `INSERT INTO poll_responses (id, sales_room_id, visitor_role, response, feedback, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [uuidv4(), salesRoom.id, role || null, response, feedback || null]
    );

    // Log analytics for poll interaction
    await run(
      `INSERT INTO sales_room_analytics (id, sales_room_id, visitor_role, section_viewed, time_spent_seconds)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), salesRoom.id, role || null, 'poll', 0]
    );

    res.json({
      success: true,
      message: 'Poll response submitted successfully'
    });
  } catch (error) {
    console.error('Error submitting poll response:', error);
    res.status(500).json({ error: 'Failed to submit poll response' });
  }
});

// GET /api/sales-rooms/public/:slug/poll/results - Get poll results (NO AUTH REQUIRED)
router.get('/:slug/poll/results', async (req, res) => {
  try {
    const { slug } = req.params;

    const salesRoom = await get(
      'SELECT id, poll_enabled, poll_question FROM sales_rooms WHERE public_url_slug = ?',
      [slug]
    );

    if (!salesRoom) {
      return res.status(404).json({ error: 'Sales Room not found' });
    }

    if (!salesRoom.poll_enabled) {
      return res.status(400).json({ error: 'Poll is not enabled for this Sales Room' });
    }

    // Get response counts using individual queries since we can't use aggregate functions easily
    const { all } = await import('../db/database.js');
    const responses = await all(
      'SELECT response, visitor_role, feedback, created_at FROM poll_responses WHERE sales_room_id = ? ORDER BY created_at DESC',
      [salesRoom.id]
    );

    // Calculate counts
    const counts = { yes: 0, partially: 0, no: 0 };
    responses.forEach(r => {
      if (counts.hasOwnProperty(r.response)) {
        counts[r.response]++;
      }
    });

    const total = responses.length;

    res.json({
      question: salesRoom.poll_question,
      total,
      results: {
        yes: { count: counts.yes, percentage: total > 0 ? Math.round((counts.yes / total) * 100) : 0 },
        partially: { count: counts.partially, percentage: total > 0 ? Math.round((counts.partially / total) * 100) : 0 },
        no: { count: counts.no, percentage: total > 0 ? Math.round((counts.no / total) * 100) : 0 }
      },
      responses: responses.map(r => ({
        response: r.response,
        role: r.visitor_role,
        feedback: r.feedback,
        created_at: r.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching poll results:', error);
    res.status(500).json({ error: 'Failed to fetch poll results' });
  }
});

// POST /api/sales-rooms/public/:slug/track - Track section view from public room (NO AUTH REQUIRED)
router.post('/:slug/track', async (req, res) => {
  try {
    const { slug } = req.params;
    const { section, role, time_spent_seconds } = req.body;

    const salesRoom = await get(
      `SELECT sr.id, sr.name, sr.is_expired, sr.public_url_slug, d.company_name as deal_company
       FROM sales_rooms sr
       LEFT JOIN deals d ON sr.deal_id = d.id
       WHERE sr.public_url_slug = ?`,
      [slug]
    );

    if (!salesRoom) {
      return res.status(404).json({ error: 'Sales Room not found' });
    }

    if (salesRoom.is_expired) {
      return res.status(410).json({ error: 'This Sales Room has expired' });
    }

    // Validate section - allow any non-empty string (dynamic stakeholder sections)
    if (!section || typeof section !== 'string' || section.length > 100) {
      return res.status(400).json({ error: 'Invalid section' });
    }

    // Log the view
    await run(
      `INSERT INTO sales_room_analytics (id, sales_room_id, visitor_role, section_viewed, time_spent_seconds)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), salesRoom.id, role || null, section, time_spent_seconds || 0]
    );

    // Send Slack notification for section view (async, don't await)
    // Only notify for specific sections to avoid spam
    const notifySections = ['cfo', 'cto', 'security', 'engineering'];
    if (notifySections.includes(section)) {
      sendSectionViewNotification(salesRoom, section, role).catch(err => {
        console.error('Failed to send section view Slack notification:', err);
      });
    }

    res.json({ success: true, message: 'View tracked' });
  } catch (error) {
    console.error('Error tracking view:', error);
    res.status(500).json({ error: 'Failed to track view' });
  }
});

// POST /api/sales-rooms/public/:slug/chat - RAG chatbot with Claude AI for Sales Room (NO AUTH REQUIRED)
router.post('/:slug/chat', async (req, res) => {
  try {
    const { slug } = req.params;
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const salesRoom = await get(
      `SELECT sr.*, d.company_name as deal_company, d.id as deal_id_ref
       FROM sales_rooms sr
       LEFT JOIN deals d ON sr.deal_id = d.id
       WHERE sr.public_url_slug = ?`,
      [slug]
    );

    if (!salesRoom) {
      return res.status(404).json({ error: 'Sales Room not found' });
    }

    if (salesRoom.is_expired) {
      return res.status(410).json({ error: 'This Sales Room has expired' });
    }

    if (!salesRoom.chatbot_enabled) {
      return res.status(400).json({ error: 'Chatbot is not enabled for this Sales Room' });
    }

    // --- Build RAG context from multiple sources ---
    const contextParts = [];

    // 1. Offer content
    if (salesRoom.offer_content) {
      contextParts.push(`## Treść oferty\n${salesRoom.offer_content.substring(0, 8000)}`);
    }

    // 2. Stakeholder sections
    if (salesRoom.sections) {
      try {
        const sections = JSON.parse(salesRoom.sections);
        if (Array.isArray(sections)) {
          const sectionTexts = sections.map(s =>
            `### ${s.label}: ${s.title}\n${(s.content || '').substring(0, 3000)}`
          ).join('\n\n');
          contextParts.push(`## Sekcje dla stakeholderów\n${sectionTexts}`);
        }
      } catch (e) { /* skip invalid JSON */ }
    }

    // 3. Knowledge Base (shared items)
    const kbItems = await all(
      `SELECT title, content, type FROM knowledge_base WHERE is_shared = 1 ORDER BY created_at DESC LIMIT 5`
    );
    if (kbItems.length > 0) {
      const kbText = kbItems.map(kb =>
        `### [${kb.type}] ${kb.title}\n${(kb.content || '').substring(0, 2000)}`
      ).join('\n\n');
      contextParts.push(`## Baza wiedzy firmy\n${kbText}`);
    }

    // 4. Deep Research data for the deal
    if (salesRoom.deal_id) {
      const research = await get(
        `SELECT research_summary, linkedin_data
         FROM research_profiles
         WHERE deal_id = ? AND status IN ('completed', 'partial')
         ORDER BY created_at DESC LIMIT 1`,
        [salesRoom.deal_id]
      );
      if (research) {
        if (research.research_summary) {
          contextParts.push(`## Wyniki badania (Deep Research)\n${research.research_summary.substring(0, 3000)}`);
        }
        if (research.linkedin_data) {
          try {
            const li = JSON.parse(research.linkedin_data);
            const company = li.company || li;
            if (company.description || company.industry) {
              contextParts.push(`## Informacje o firmie (LinkedIn)\nBranża: ${company.industry || 'N/A'}\nOpis: ${(company.description || '').substring(0, 1000)}`);
            }
          } catch (e) { /* skip */ }
        }
      }
    }

    // 5. Conversation history (last 10 exchanges)
    const recentLogs = await all(
      `SELECT question, answer FROM chatbot_logs
       WHERE sales_room_id = ?
       ORDER BY asked_at DESC LIMIT 10`,
      [salesRoom.id]
    );
    const conversationHistory = recentLogs.reverse().flatMap(log => [
      { role: 'user', content: log.question },
      { role: 'assistant', content: log.answer }
    ]);

    // --- Call Claude API ---
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
      return res.json({
        response: 'Asystent AI nie jest skonfigurowany. Skontaktuj się z przedstawicielem handlowym.',
        timestamp: new Date().toISOString()
      });
    }

    const systemPrompt = `Jesteś pomocnym asystentem sprzedażowym dla ${salesRoom.deal_company || 'naszej firmy'}.
Odpowiadasz na pytania dotyczące naszej propozycji/oferty WYŁĄCZNIE na podstawie dostarczonego kontekstu.
Bądź pomocny, profesjonalny i zwięzły. Jeśli nie znasz odpowiedzi na podstawie kontekstu, powiedz o tym grzecznie i zasugeruj kontakt z przedstawicielem handlowym.
WAŻNE: Odpowiadaj w tym samym języku co treść kontekstu. Jeśli treść jest po polsku, odpowiadaj po polsku.
NIE wymyślaj informacji, których nie ma w kontekście.
Odpowiedzi powinny być zwięzłe (2-4 akapity max).

## Kontekst naszej propozycji:
${contextParts.join('\n\n')}`;

    const messages = [
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages,
      }),
    });

    let response;
    if (apiResponse.ok) {
      const data = await apiResponse.json();
      response = data.content?.[0]?.text || 'Nie udało się wygenerować odpowiedzi. Spróbuj ponownie.';
    } else {
      console.error('Claude API error in chatbot:', apiResponse.status);
      response = 'Asystent jest chwilowo niedostępny. Spróbuj ponownie później lub skontaktuj się z przedstawicielem handlowym.';
    }

    // Log analytics
    await run(
      `INSERT INTO sales_room_analytics (id, sales_room_id, visitor_role, section_viewed, time_spent_seconds)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), salesRoom.id, null, 'chatbot', 0]
    );

    // Log the conversation
    await run(
      `INSERT INTO chatbot_logs (id, sales_room_id, question, answer)
       VALUES (?, ?, ?, ?)`,
      [uuidv4(), salesRoom.id, message, response]
    );

    res.json({ response, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Error processing chat message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// GET /api/sales-rooms/public/:slug/attachment - Download attachment (NO AUTH REQUIRED)
router.get('/:slug/attachment', async (req, res) => {
  try {
    const { slug } = req.params;

    const salesRoom = await get(
      `SELECT id, is_expired, attachment_filename, attachment_path, attachment_mimetype
       FROM sales_rooms
       WHERE public_url_slug = ?`,
      [slug]
    );

    if (!salesRoom) {
      return res.status(404).json({ error: 'Sales Room not found' });
    }

    if (salesRoom.is_expired) {
      return res.status(410).json({ error: 'This Sales Room has expired' });
    }

    if (!salesRoom.attachment_filename || !salesRoom.attachment_path) {
      return res.status(404).json({ error: 'No attachment available' });
    }

    const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

    if (useBlob && salesRoom.attachment_path.startsWith('http')) {
      // Fetch from Vercel Blob Storage using authenticated downloadUrl
      try {
        const { head } = await import('@vercel/blob');
        const blobDetails = await head(salesRoom.attachment_path);

        const response = await fetch(blobDetails.downloadUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch file from Blob Storage: ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        const encodedFilename = encodeURIComponent(salesRoom.attachment_filename);

        res.setHeader('Content-Type', salesRoom.attachment_mimetype || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${salesRoom.attachment_filename}"; filename*=UTF-8''${encodedFilename}`);
        res.setHeader('Content-Length', buffer.byteLength);
        res.setHeader('Cache-Control', 'no-cache');
        res.send(Buffer.from(buffer));
      } catch (err) {
        console.error('Error downloading from Blob Storage:', err);
        return res.status(500).json({ error: 'Failed to download attachment' });
      }
    } else {
      // Local disk storage - redirect to static file endpoint
      const filename = path.basename(salesRoom.attachment_path);
      return res.redirect(`/api/uploads/${filename}`);
    }
  } catch (error) {
    console.error('Error downloading attachment:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

// ── Client ↔ User Messaging ──────────────────────────────────────────

// GET /api/sales-rooms/public/:slug/messages - Get messages (NO AUTH REQUIRED)
router.get('/:slug/messages', async (req, res) => {
  try {
    const { slug } = req.params;
    const { since } = req.query;

    const salesRoom = await get(
      'SELECT id, is_expired FROM sales_rooms WHERE public_url_slug = ?',
      [slug]
    );

    if (!salesRoom) return res.status(404).json({ error: 'Sales Room not found' });
    if (salesRoom.is_expired) return res.status(410).json({ error: 'This Sales Room has expired' });

    let sql = `SELECT id, sender_type, sender_name, content, attachment_filename, attachment_path, attachment_mimetype, attachment_size, created_at
               FROM sales_room_messages
               WHERE sales_room_id = ?`;
    const params = [salesRoom.id];

    if (since) {
      sql += ` AND created_at > ?`;
      params.push(since);
    }

    sql += ` ORDER BY created_at ASC LIMIT 100`;

    const messages = await all(sql, params);
    res.json({ messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/sales-rooms/public/:slug/messages - Send message from client (NO AUTH REQUIRED)
router.post('/:slug/messages', async (req, res) => {
  try {
    const { slug } = req.params;
    const { content, senderName, senderEmail } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' });
    }
    if (!senderName || typeof senderName !== 'string' || senderName.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const salesRoom = await get(
      'SELECT id, is_expired, created_by FROM sales_rooms WHERE public_url_slug = ?',
      [slug]
    );

    if (!salesRoom) return res.status(404).json({ error: 'Sales Room not found' });
    if (salesRoom.is_expired) return res.status(410).json({ error: 'This Sales Room has expired' });

    const messageId = uuidv4();
    await run(
      `INSERT INTO sales_room_messages (id, sales_room_id, sender_type, sender_name, sender_email, content)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [messageId, salesRoom.id, 'client', senderName.trim(), senderEmail?.trim() || null, content.trim()]
    );

    res.status(201).json({
      message: { id: messageId, sender_type: 'client', sender_name: senderName.trim(), content: content.trim(), created_at: new Date().toISOString() }
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
