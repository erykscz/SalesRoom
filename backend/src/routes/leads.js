import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { run, get, all } from '../db/database.js';

const router = express.Router();

// GET /api/leads - List all leads with filters
router.get('/', async (req, res) => {
  try {
    const { status, search, sort_by = 'created_at', sort_order = 'desc', min_confidence } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    let query = `
      SELECT l.*, u.name as owner_name
      FROM leads l
      LEFT JOIN users u ON l.owner_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // Filter by owner unless manager/admin (can see all)
    if (userRole !== 'manager' && userRole !== 'admin') {
      query += ` AND l.owner_id = ?`;
      params.push(userId);
    }

    // Filter by status
    if (status) {
      query += ` AND l.status = ?`;
      params.push(status);
    }

    // Filter by minimum confidence score
    if (min_confidence) {
      const minScore = parseInt(min_confidence, 10);
      if (!isNaN(minScore)) {
        query += ` AND l.confidence_score >= ?`;
        params.push(minScore);
      }
    }

    // Search by name, company name, email, or industry
    if (search) {
      query += ` AND (l.name LIKE ? OR l.email LIKE ? OR l.company_name LIKE ? OR l.industry LIKE ? OR l.identified_pain LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Sorting
    const validSortFields = ['created_at', 'company_name', 'confidence_score', 'status'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
    const order = sort_order === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY l.${sortField} ${order}`;

    const leads = await all(query, params);

    // Parse JSON fields
    const parsedLeads = leads.map(lead => ({
      ...lead,
      tech_stack: lead.tech_stack ? JSON.parse(lead.tech_stack) : [],
      hook_suggestions: lead.hook_suggestions ? JSON.parse(lead.hook_suggestions) : [],
      competitor_info: lead.competitor_info ? JSON.parse(lead.competitor_info) : null,
      trigger_events: lead.trigger_events ? JSON.parse(lead.trigger_events) : []
    }));

    res.json(parsedLeads);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// POST /api/leads - Create a new lead
router.post('/', async (req, res) => {
  try {
    const {
      name,
      job_title,
      email,
      phone,
      linkedin_url,
      company_name,
      industry,
      tech_stack,
      identified_pain,
      confidence_score,
      source_link,
      status,
      notes
    } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const id = uuidv4();
    const owner_id = req.user.id;
    const now = new Date().toISOString();

    await run(`
      INSERT INTO leads (
        id, name, job_title, email, phone, linkedin_url,
        company_name, industry, tech_stack, identified_pain,
        confidence_score, source_link, status, owner_id, notes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      name.trim(),
      job_title || null,
      email || null,
      phone || null,
      linkedin_url || null,
      company_name ? company_name.trim() : null,
      industry || null,
      tech_stack ? JSON.stringify(tech_stack) : null,
      identified_pain || null,
      confidence_score || 0,
      source_link || null,
      status || 'new',
      owner_id,
      notes || null,
      now,
      now
    ]);

    const lead = await get('SELECT * FROM leads WHERE id = ?', [id]);

    res.status(201).json({
      ...lead,
      tech_stack: lead.tech_stack ? JSON.parse(lead.tech_stack) : []
    });
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

// GET /api/leads/:id - Get a single lead
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const lead = await get(`
      SELECT l.*, u.name as owner_name
      FROM leads l
      LEFT JOIN users u ON l.owner_id = u.id
      WHERE l.id = ?
    `, [id]);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Check ownership unless manager/admin
    if (userRole !== 'manager' && userRole !== 'admin' && lead.owner_id !== userId) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json({
      ...lead,
      tech_stack: lead.tech_stack ? JSON.parse(lead.tech_stack) : [],
      hook_suggestions: lead.hook_suggestions ? JSON.parse(lead.hook_suggestions) : [],
      competitor_info: lead.competitor_info ? JSON.parse(lead.competitor_info) : null,
      trigger_events: lead.trigger_events ? JSON.parse(lead.trigger_events) : []
    });
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ error: 'Failed to fetch lead' });
  }
});

// PUT /api/leads/:id - Update a lead
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const lead = await get('SELECT * FROM leads WHERE id = ?', [id]);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Check ownership unless admin
    if (userRole !== 'admin' && lead.owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to edit this lead' });
    }

    const {
      name,
      job_title,
      email,
      phone,
      linkedin_url,
      company_name,
      industry,
      tech_stack,
      identified_pain,
      confidence_score,
      source_link,
      status,
      notes
    } = req.body;

    // Validation
    if (name !== undefined && name.trim().length === 0) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    const now = new Date().toISOString();

    await run(`
      UPDATE leads SET
        name = COALESCE(?, name),
        job_title = COALESCE(?, job_title),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        linkedin_url = COALESCE(?, linkedin_url),
        company_name = COALESCE(?, company_name),
        industry = COALESCE(?, industry),
        tech_stack = COALESCE(?, tech_stack),
        identified_pain = COALESCE(?, identified_pain),
        confidence_score = COALESCE(?, confidence_score),
        source_link = COALESCE(?, source_link),
        status = COALESCE(?, status),
        notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ?
    `, [
      name ? name.trim() : null,
      job_title,
      email,
      phone,
      linkedin_url,
      company_name ? company_name.trim() : null,
      industry,
      tech_stack ? JSON.stringify(tech_stack) : null,
      identified_pain,
      confidence_score,
      source_link,
      status,
      notes,
      now,
      id
    ]);

    const updatedLead = await get('SELECT * FROM leads WHERE id = ?', [id]);

    res.json({
      ...updatedLead,
      tech_stack: updatedLead.tech_stack ? JSON.parse(updatedLead.tech_stack) : []
    });
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// DELETE /api/leads/:id - Delete a lead
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const lead = await get('SELECT * FROM leads WHERE id = ?', [id]);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Check ownership unless admin
    if (userRole !== 'admin' && lead.owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this lead' });
    }

    await run('DELETE FROM leads WHERE id = ?', [id]);

    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

// POST /api/leads/:id/convert-to-deal - Convert lead to deal
router.post('/:id/convert-to-deal', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const lead = await get('SELECT * FROM leads WHERE id = ?', [id]);

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Check ownership unless admin
    if (userRole !== 'admin' && lead.owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to convert this lead' });
    }

    // Check if already converted
    if (lead.deal_id) {
      return res.status(400).json({ error: 'Lead already converted to a deal' });
    }

    const dealId = uuidv4();
    const activityId = uuidv4();
    const now = new Date().toISOString();
    const nextStepDate = new Date();
    nextStepDate.setDate(nextStepDate.getDate() + 7); // Default 7 days

    // Create the deal - copy all person fields from lead
    await run(`
      INSERT INTO deals (
        id, name, job_title, email, phone, linkedin_url,
        company_name, industry, stage, estimated_value,
        next_step_date, next_step_description, health_score, owner_id,
        source, priority, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      dealId,
      lead.name,
      lead.job_title || null,
      lead.email || null,
      lead.phone || null,
      lead.linkedin_url || null,
      lead.company_name,
      lead.industry,
      'qualified', // Start as qualified since it came from Intent Scraper
      0,
      nextStepDate.toISOString().split('T')[0],
      'Follow up from Intent Scraper lead',
      50, // Default health score
      userId,
      'intent_scraper',
      'medium',
      now,
      now
    ]);

    // Update lead with deal_id and status
    await run(`
      UPDATE leads SET deal_id = ?, status = 'qualified', updated_at = ?
      WHERE id = ?
    `, [dealId, now, id]);

    // Create activity for the deal
    try {
      await run(`
        INSERT INTO activities (id, deal_id, activity_type, description, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [activityId, dealId, 'deal_created', `Deal created from Intent Scraper lead: ${lead.name}`, userId, now]);
    } catch (activityErr) {
      console.error('Error creating activity:', activityErr);
      // Don't fail the whole operation for this
    }

    const deal = await get('SELECT * FROM deals WHERE id = ?', [dealId]);

    res.status(201).json({
      message: 'Lead converted to deal successfully',
      deal
    });
  } catch (error) {
    console.error('Error converting lead to deal:', error);
    res.status(500).json({ error: 'Failed to convert lead to deal' });
  }
});

export default router;
