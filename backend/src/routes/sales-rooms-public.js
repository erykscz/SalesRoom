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

    // Add attachment URL if exists
    if (salesRoom.attachment_filename && salesRoom.attachment_path) {
      salesRoom.attachment_url = `/api/uploads/${path.basename(salesRoom.attachment_path)}`;
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

// POST /api/sales-rooms/public/:slug/chat - RAG chatbot for Sales Room (NO AUTH REQUIRED)
router.post('/:slug/chat', async (req, res) => {
  try {
    const { slug } = req.params;
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const salesRoom = await get(
      `SELECT sr.*, d.company_name as deal_company
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

    // Simple RAG implementation - search for relevant content in offer_content
    const userMessage = message.toLowerCase().trim();
    let response = '';

    // Get the offer content and section content
    const content = salesRoom.offer_content || '';
    const sections = salesRoom.sections ? JSON.parse(salesRoom.sections) : null;

    // Build knowledge base from all available content
    let knowledgeBase = content;
    if (sections) {
      Object.values(sections).forEach(section => {
        if (typeof section === 'string') {
          knowledgeBase += '\n' + section;
        } else if (section && section.content) {
          knowledgeBase += '\n' + section.content;
        }
      });
    }

    // Extract relevant sections based on keywords
    const paragraphs = knowledgeBase.split(/\n\n+/).filter(p => p.trim().length > 20);

    // Score paragraphs by relevance to the question
    const keywords = userMessage.split(/\s+/).filter(w => w.length > 2);
    const scoredParagraphs = paragraphs.map(p => {
      const pLower = p.toLowerCase();
      let score = 0;
      keywords.forEach(kw => {
        if (pLower.includes(kw)) {
          score += 1;
        }
      });
      // Boost for section headers that match
      if (pLower.includes('###') || pLower.includes('##')) {
        score += 0.5;
      }
      return { text: p, score };
    }).filter(p => p.score > 0).sort((a, b) => b.score - a.score);

    // Build response from top matching paragraphs
    if (scoredParagraphs.length > 0) {
      const topMatches = scoredParagraphs.slice(0, 3);
      const relevantInfo = topMatches.map(p => p.text.replace(/[#*]+/g, '').trim()).join('\n\n');

      // Generate a conversational response
      if (userMessage.includes('price') || userMessage.includes('cost') || userMessage.includes('pricing')) {
        response = `Based on our proposal, here's the pricing information:\n\n${relevantInfo}`;
      } else if (userMessage.includes('timeline') || userMessage.includes('how long') || userMessage.includes('when')) {
        response = `Regarding the timeline:\n\n${relevantInfo}`;
      } else if (userMessage.includes('feature') || userMessage.includes('include') || userMessage.includes('offer')) {
        response = `Here are the key features we offer:\n\n${relevantInfo}`;
      } else if (userMessage.includes('support') || userMessage.includes('help')) {
        response = `About our support services:\n\n${relevantInfo}`;
      } else if (userMessage.includes('contact') || userMessage.includes('reach') || userMessage.includes('talk')) {
        response = `Here's how to get in touch:\n\n${relevantInfo}`;
      } else {
        response = `Based on our proposal, I found this relevant information:\n\n${relevantInfo}`;
      }
    } else {
      // Default responses for common questions
      if (userMessage.includes('hello') || userMessage.includes('hi') || userMessage.includes('hey')) {
        response = `Hello! I'm the Sales Room assistant for ${salesRoom.deal_company || 'this proposal'}. I can help answer questions about our offer, pricing, timeline, and features. What would you like to know?`;
      } else if (userMessage.includes('thank')) {
        response = `You're welcome! Is there anything else you'd like to know about our proposal?`;
      } else {
        response = `I don't have specific information about that in our proposal. Here's a summary of what's included:\n\n${content ? content.substring(0, 500) + '...' : 'Our proposal details are being prepared. Please check back later or contact the sales representative.'}`;
      }
    }

    // Log the chat interaction for analytics
    await run(
      `INSERT INTO sales_room_analytics (id, sales_room_id, visitor_role, section_viewed, time_spent_seconds)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), salesRoom.id, null, 'chatbot', 0]
    );

    // Log the chatbot conversation
    await run(
      `INSERT INTO chatbot_logs (id, sales_room_id, question, answer)
       VALUES (?, ?, ?, ?)`,
      [uuidv4(), salesRoom.id, message, response]
    );

    res.json({
      response,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing chat message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

export default router;
