import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { get, run, all } from '../db/database.js';
import crypto from 'crypto';

const router = express.Router();

// Generate a unique URL slug
function generateSlug() {
  return crypto.randomBytes(8).toString('hex');
}

// GET /api/sales-rooms - List all sales rooms
router.get('/', async (req, res) => {
  try {
    const { deal_id, template_type, expired } = req.query;

    let sql = `
      SELECT sr.*, d.company_name as deal_company, u.name as created_by_name
      FROM sales_rooms sr
      LEFT JOIN deals d ON sr.deal_id = d.id
      LEFT JOIN users u ON sr.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    // Filter by deal
    if (deal_id) {
      sql += ' AND sr.deal_id = ?';
      params.push(deal_id);
    }

    // Filter by template type
    if (template_type) {
      sql += ' AND sr.template_type = ?';
      params.push(template_type);
    }

    // Filter by expired status
    if (expired !== undefined) {
      sql += ' AND sr.is_expired = ?';
      params.push(expired === 'true' ? 1 : 0);
    }

    // For non-admin/manager users, only show their own sales rooms
    if (req.user.role === 'rep' || req.user.role === 'sdr' || req.user.role === 'ae') {
      sql += ' AND d.owner_id = ?';
      params.push(req.user.id);
    }

    sql += ' ORDER BY sr.created_at DESC';

    const salesRooms = await all(sql, params);

    res.json({ salesRooms });
  } catch (error) {
    console.error('Error fetching sales rooms:', error);
    res.status(500).json({ error: 'Failed to fetch sales rooms' });
  }
});

// POST /api/sales-rooms - Create a new sales room
router.post('/', async (req, res) => {
  try {
    const {
      deal_id,
      template_type,
      offer_content,
      sections,
      chatbot_enabled,
      video_url,
      calendly_link,
      branding,
      expires_at,
      password_protected,
      password,
      mutual_action_plan,
      poll_enabled,
      poll_question
    } = req.body;

    // Validate required fields
    if (!deal_id) {
      return res.status(400).json({ error: 'Deal ID is required' });
    }

    // Verify deal exists
    const deal = await get('SELECT id, owner_id, first_name, last_name, company_name, stage FROM deals WHERE id = ?', [deal_id]);
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Check authorization
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && deal.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if sales room already exists for this deal
    const existingRoom = await get('SELECT id FROM sales_rooms WHERE deal_id = ?', [deal_id]);
    if (existingRoom) {
      return res.status(400).json({ error: 'A Sales Room already exists for this deal' });
    }

    // Validate template type
    const validTemplates = ['legacy_modernization', 'cloud_migration', 'staff_augmentation', 'custom'];
    const templateTypeValue = template_type || 'custom';
    if (!validTemplates.includes(templateTypeValue)) {
      return res.status(400).json({ error: 'Invalid template type' });
    }

    const salesRoomId = uuidv4();
    const publicUrlSlug = generateSlug();

    // Hash password if provided
    let passwordHash = null;
    if (password_protected && password) {
      const bcrypt = await import('bcryptjs');
      passwordHash = bcrypt.default.hashSync(password, 10);
    }

    await run(
      `INSERT INTO sales_rooms (
        id, deal_id, template_type, public_url_slug, offer_content, sections,
        chatbot_enabled, video_url, calendly_link, branding, is_expired, expires_at,
        password_protected, password_hash, mutual_action_plan, poll_enabled,
        poll_question, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        salesRoomId,
        deal_id,
        templateTypeValue,
        publicUrlSlug,
        offer_content || null,
        sections ? JSON.stringify(sections) : null,
        chatbot_enabled !== false ? 1 : 0,
        video_url || null,
        calendly_link || null,
        branding ? JSON.stringify(branding) : null,
        0, // is_expired
        expires_at || null,
        password_protected ? 1 : 0,
        passwordHash,
        mutual_action_plan ? JSON.stringify(mutual_action_plan) : null,
        poll_enabled ? 1 : 0,
        poll_question || null,
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
        'sales_room_created',
        `Sales Room created for ${deal.first_name} ${deal.last_name}`,
        JSON.stringify({ sales_room_id: salesRoomId, template_type: templateTypeValue, public_url_slug: publicUrlSlug }),
        req.user.id
      ]
    );

    // Auto-advance to solution_design if deal is in earlier stage
    const earlyStages = ['new_signal', 'qualified', 'discovery'];
    if (earlyStages.includes(deal.stage)) {
      await run(
        'UPDATE deals SET stage = ?, updated_at = datetime("now") WHERE id = ?',
        ['solution_design', deal_id]
      );

      // Log stage change
      await run(
        `INSERT INTO activities (id, deal_id, activity_type, description, metadata, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          deal_id,
          'stage_changed',
          'Stage auto-advanced to Solution Design (Sales Room created)',
          JSON.stringify({ from: deal.stage, to: 'solution_design', reason: 'sales_room_created' }),
          req.user.id
        ]
      );
    }

    const salesRoom = await get(
      `SELECT sr.*, d.company_name as deal_company
       FROM sales_rooms sr
       LEFT JOIN deals d ON sr.deal_id = d.id
       WHERE sr.id = ?`,
      [salesRoomId]
    );

    res.status(201).json({
      salesRoom,
      publicUrl: `/r/${publicUrlSlug}`,
      message: 'Sales Room created successfully'
    });
  } catch (error) {
    console.error('Error creating sales room:', error);
    res.status(500).json({ error: 'Failed to create sales room' });
  }
});

// GET /api/sales-rooms/:id - Get a specific sales room
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const salesRoom = await get(
      `SELECT sr.*, d.company_name as deal_company, d.owner_id, u.name as created_by_name
       FROM sales_rooms sr
       LEFT JOIN deals d ON sr.deal_id = d.id
       LEFT JOIN users u ON sr.created_by = u.id
       WHERE sr.id = ?`,
      [id]
    );

    if (!salesRoom) {
      return res.status(404).json({ error: 'Sales Room not found' });
    }

    // Check authorization
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && salesRoom.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

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

    // Get analytics
    const analytics = await all(
      `SELECT * FROM sales_room_analytics WHERE sales_room_id = ? ORDER BY visited_at DESC LIMIT 100`,
      [id]
    );

    // Get chatbot logs
    const chatbotLogs = await all(
      `SELECT * FROM chatbot_logs WHERE sales_room_id = ? ORDER BY asked_at DESC LIMIT 50`,
      [id]
    );

    res.json({ salesRoom, analytics, chatbotLogs });
  } catch (error) {
    console.error('Error fetching sales room:', error);
    res.status(500).json({ error: 'Failed to fetch sales room' });
  }
});

// PUT /api/sales-rooms/:id - Update a sales room
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const salesRoom = await get(
      `SELECT sr.*, d.owner_id
       FROM sales_rooms sr
       LEFT JOIN deals d ON sr.deal_id = d.id
       WHERE sr.id = ?`,
      [id]
    );

    if (!salesRoom) {
      return res.status(404).json({ error: 'Sales Room not found' });
    }

    // Check authorization
    if (req.user.role !== 'admin' && salesRoom.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      offer_content,
      sections,
      chatbot_enabled,
      video_url,
      calendly_link,
      branding,
      is_expired,
      expires_at,
      password_protected,
      password,
      mutual_action_plan,
      poll_enabled,
      poll_question
    } = req.body;

    const updates = [];
    const params = [];

    if (offer_content !== undefined) {
      updates.push('offer_content = ?');
      params.push(offer_content);
    }
    if (sections !== undefined) {
      updates.push('sections = ?');
      params.push(JSON.stringify(sections));
    }
    if (chatbot_enabled !== undefined) {
      updates.push('chatbot_enabled = ?');
      params.push(chatbot_enabled ? 1 : 0);
    }
    if (video_url !== undefined) {
      updates.push('video_url = ?');
      params.push(video_url);
    }
    if (calendly_link !== undefined) {
      updates.push('calendly_link = ?');
      params.push(calendly_link);
    }
    if (branding !== undefined) {
      updates.push('branding = ?');
      params.push(JSON.stringify(branding));
    }
    if (is_expired !== undefined) {
      updates.push('is_expired = ?');
      params.push(is_expired ? 1 : 0);
    }
    if (expires_at !== undefined) {
      updates.push('expires_at = ?');
      params.push(expires_at);
    }
    if (password_protected !== undefined) {
      updates.push('password_protected = ?');
      params.push(password_protected ? 1 : 0);
    }
    if (password) {
      const bcrypt = await import('bcryptjs');
      updates.push('password_hash = ?');
      params.push(bcrypt.default.hashSync(password, 10));
    }
    if (mutual_action_plan !== undefined) {
      updates.push('mutual_action_plan = ?');
      params.push(JSON.stringify(mutual_action_plan));
    }
    if (poll_enabled !== undefined) {
      updates.push('poll_enabled = ?');
      params.push(poll_enabled ? 1 : 0);
    }
    if (poll_question !== undefined) {
      updates.push('poll_question = ?');
      params.push(poll_question);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = datetime("now")');
    params.push(id);

    await run(
      `UPDATE sales_rooms SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const updatedRoom = await get('SELECT * FROM sales_rooms WHERE id = ?', [id]);
    if (updatedRoom.sections) {
      updatedRoom.sections = JSON.parse(updatedRoom.sections);
    }
    if (updatedRoom.branding) {
      updatedRoom.branding = JSON.parse(updatedRoom.branding);
    }
    if (updatedRoom.mutual_action_plan) {
      updatedRoom.mutual_action_plan = JSON.parse(updatedRoom.mutual_action_plan);
    }

    res.json({ salesRoom: updatedRoom, message: 'Sales Room updated successfully' });
  } catch (error) {
    console.error('Error updating sales room:', error);
    res.status(500).json({ error: 'Failed to update sales room' });
  }
});

// DELETE /api/sales-rooms/:id - Delete a sales room
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const salesRoom = await get(
      `SELECT sr.*, d.owner_id
       FROM sales_rooms sr
       LEFT JOIN deals d ON sr.deal_id = d.id
       WHERE sr.id = ?`,
      [id]
    );

    if (!salesRoom) {
      return res.status(404).json({ error: 'Sales Room not found' });
    }

    // Check authorization
    if (req.user.role !== 'admin' && salesRoom.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await run('DELETE FROM sales_rooms WHERE id = ?', [id]);

    res.json({ message: 'Sales Room deleted successfully' });
  } catch (error) {
    console.error('Error deleting sales room:', error);
    res.status(500).json({ error: 'Failed to delete sales room' });
  }
});

// POST /api/sales-rooms/:id/clone - Clone a sales room
router.post('/:id/clone', async (req, res) => {
  try {
    const { id } = req.params;
    const { deal_id } = req.body;

    const sourceRoom = await get(
      `SELECT sr.*, d.owner_id
       FROM sales_rooms sr
       LEFT JOIN deals d ON sr.deal_id = d.id
       WHERE sr.id = ?`,
      [id]
    );

    if (!sourceRoom) {
      return res.status(404).json({ error: 'Sales Room not found' });
    }

    // Check authorization
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && sourceRoom.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!deal_id) {
      return res.status(400).json({ error: 'Target deal ID is required' });
    }

    // Verify target deal
    const targetDeal = await get('SELECT id, owner_id, first_name, last_name, company_name FROM deals WHERE id = ?', [deal_id]);
    if (!targetDeal) {
      return res.status(404).json({ error: 'Target deal not found' });
    }

    // Check if sales room already exists for target deal
    const existingRoom = await get('SELECT id FROM sales_rooms WHERE deal_id = ?', [deal_id]);
    if (existingRoom) {
      return res.status(400).json({ error: 'A Sales Room already exists for the target deal' });
    }

    const newRoomId = uuidv4();
    const newSlug = generateSlug();

    await run(
      `INSERT INTO sales_rooms (
        id, deal_id, template_type, public_url_slug, offer_content, sections,
        chatbot_enabled, video_url, calendly_link, branding, is_expired,
        password_protected, poll_enabled, poll_question, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newRoomId,
        deal_id,
        sourceRoom.template_type,
        newSlug,
        sourceRoom.offer_content,
        sourceRoom.sections,
        sourceRoom.chatbot_enabled,
        sourceRoom.video_url,
        sourceRoom.calendly_link,
        sourceRoom.branding,
        0,
        0,
        sourceRoom.poll_enabled,
        sourceRoom.poll_question,
        req.user.id
      ]
    );

    // Create activity log
    await run(
      `INSERT INTO activities (id, deal_id, activity_type, description, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), deal_id, 'sales_room_created', `Sales Room cloned for ${targetDeal.first_name} ${targetDeal.last_name}`, req.user.id]
    );

    const newRoom = await get('SELECT * FROM sales_rooms WHERE id = ?', [newRoomId]);

    res.status(201).json({
      salesRoom: newRoom,
      publicUrl: `/r/${newSlug}`,
      message: 'Sales Room cloned successfully'
    });
  } catch (error) {
    console.error('Error cloning sales room:', error);
    res.status(500).json({ error: 'Failed to clone sales room' });
  }
});

// GET /api/sales-rooms/public/:slug - Public access for clients
router.get('/public/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { role, password } = req.query;

    const salesRoom = await get(
      `SELECT sr.*, d.company_name as deal_company, d.id as deal_id
       FROM sales_rooms sr
       LEFT JOIN deals d ON sr.deal_id = d.id
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

    // Remove sensitive fields
    delete salesRoom.password_hash;
    delete salesRoom.created_by;

    res.json({ salesRoom });
  } catch (error) {
    console.error('Error fetching public sales room:', error);
    res.status(500).json({ error: 'Failed to fetch sales room' });
  }
});

// GET /api/sales-rooms/:id/analytics - Get analytics for a sales room
router.get('/:id/analytics', async (req, res) => {
  try {
    const { id } = req.params;

    const salesRoom = await get(
      `SELECT sr.*, d.owner_id
       FROM sales_rooms sr
       LEFT JOIN deals d ON sr.deal_id = d.id
       WHERE sr.id = ?`,
      [id]
    );

    if (!salesRoom) {
      return res.status(404).json({ error: 'Sales Room not found' });
    }

    // Check authorization
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && salesRoom.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const analytics = await all(
      `SELECT * FROM sales_room_analytics WHERE sales_room_id = ? ORDER BY visited_at DESC`,
      [id]
    );

    // Aggregate stats
    const stats = {
      totalViews: analytics.length,
      uniqueRoles: [...new Set(analytics.filter(a => a.visitor_role).map(a => a.visitor_role))],
      sectionViews: {},
      totalTimeSpent: analytics.reduce((sum, a) => sum + (a.time_spent_seconds || 0), 0)
    };

    analytics.forEach(a => {
      if (a.section_viewed) {
        stats.sectionViews[a.section_viewed] = (stats.sectionViews[a.section_viewed] || 0) + 1;
      }
    });

    res.json({ analytics, stats });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// GET /api/sales-rooms/:id/chatbot-logs - Get chatbot conversation logs for a sales room
router.get('/:id/chatbot-logs', async (req, res) => {
  try {
    const { id } = req.params;

    const salesRoom = await get(
      `SELECT sr.*, d.owner_id
       FROM sales_rooms sr
       LEFT JOIN deals d ON sr.deal_id = d.id
       WHERE sr.id = ?`,
      [id]
    );

    if (!salesRoom) {
      return res.status(404).json({ error: 'Sales Room not found' });
    }

    // Check authorization
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && salesRoom.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const logs = await all(
      `SELECT * FROM chatbot_logs WHERE sales_room_id = ? ORDER BY asked_at DESC`,
      [id]
    );

    res.json({ logs, totalConversations: logs.length });
  } catch (error) {
    console.error('Error fetching chatbot logs:', error);
    res.status(500).json({ error: 'Failed to fetch chatbot logs' });
  }
});

// POST /api/sales-rooms/public/:slug/track - Track section view from public room (no auth required)
router.post('/public/:slug/track', async (req, res) => {
  try {
    const { slug } = req.params;
    const { section, role, time_spent_seconds } = req.body;

    const salesRoom = await get(
      'SELECT id, is_expired FROM sales_rooms WHERE public_url_slug = ?',
      [slug]
    );

    if (!salesRoom) {
      return res.status(404).json({ error: 'Sales Room not found' });
    }

    if (salesRoom.is_expired) {
      return res.status(410).json({ error: 'This Sales Room has expired' });
    }

    // Validate section
    const validSections = ['overview', 'cfo', 'cto', 'security', 'engineering', 'map', 'poll'];
    if (!section || !validSections.includes(section)) {
      return res.status(400).json({ error: 'Invalid section' });
    }

    // Log the view
    await run(
      `INSERT INTO sales_room_analytics (id, sales_room_id, visitor_role, section_viewed, time_spent_seconds)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), salesRoom.id, role || null, section, time_spent_seconds || 0]
    );

    res.json({ success: true, message: 'View tracked' });
  } catch (error) {
    console.error('Error tracking view:', error);
    res.status(500).json({ error: 'Failed to track view' });
  }
});

export default router;
