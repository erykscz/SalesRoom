import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { get, run, all } from '../db/database.js';
import { createNotification } from './notifications.js';
import { calculateHealthScore } from '../utils/healthScore.js';

const router = express.Router();

// Parse CSV values (handle quoted fields) - shared between endpoints
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Extended column matching patterns for flexible CSV import
const COLUMN_PATTERNS = {
  name: ['name', 'contact name', 'full name', 'person', 'lead name', 'prospect', 'display name', 'linkedin name'],
  first_name: ['first name', 'firstname', 'given name', 'fname'],
  last_name: ['last name', 'lastname', 'surname', 'lname'],
  email: ['email', 'email address', 'e-mail', 'mail', 'work email'],
  phone: ['phone', 'telephone', 'mobile', 'cell'],
  job_title: ['job title', 'title', 'position', 'role', 'current role(s)'],
  company_name: ['company name', 'company', 'organization', 'organisation', 'account', 'employer', 'firm'],
  company_url: ['company url', 'website', 'company website', 'organisation website', 'domain'],
  industry: ['industry', 'sector', 'vertical'],
  linkedin_url: ['linkedin url', 'linkedin', 'profile link', 'linkedin profile', 'sales navigator profile link', 'person linkedin url', 'linkedin profile url'],
  stage: ['stage', 'deal stage', 'pipeline stage'],
  estimated_value: ['estimated value', 'value', 'deal value', 'amount', 'revenue'],
  close_date: ['close date', 'expected close', 'closing date'],
  next_step_date: ['next step date', 'next step', 'follow up date', 'follow-up date'],
  next_step_description: ['next step description', 'next step desc', 'next action'],
  priority: ['priority', 'urgency', 'importance'],
};

function detectColumnMappings(headers) {
  const mappings = {};
  const normalizedHeaders = headers.map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

  for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
    const index = normalizedHeaders.findIndex(h => patterns.includes(h));
    if (index >= 0) {
      mappings[field] = index;
    }
  }

  return mappings;
}

function detectFormat(headers) {
  const normalizedHeaders = headers.map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const linkedInSignatures = ['linkedin name', 'sales navigator profile link', 'organisation'];
  const isLinkedIn = linkedInSignatures.some(sig => normalizedHeaders.includes(sig));
  if (isLinkedIn) return 'linkedin';
  return 'standard';
}

// GET /api/deals - List all deals
router.get('/', async (req, res) => {
  try {
    const { stage, owner, health_score_min, health_score_max, search, archived, sort_by, sort_order, page, limit, date_filter, list } = req.query;

    // Pagination defaults
    const pageNum = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 20;
    const offset = (pageNum - 1) * pageSize;

    let sql = `
      SELECT d.*, u.name as owner_name, u.email as owner_email
      FROM deals d
      LEFT JOIN users u ON d.owner_id = u.id
      WHERE 1=1
    `;

    let countSql = `
      SELECT COUNT(*) as total
      FROM deals d
      WHERE 1=1
    `;

    const params = [];
    const countParams = [];

    // Filter by stage
    if (stage) {
      sql += ' AND d.stage = ?';
      countSql += ' AND d.stage = ?';
      params.push(stage);
      countParams.push(stage);
    }

    // Filter by owner: Admins and managers can see all deals, others only their own
    if (req.user.role === 'admin' || req.user.role === 'manager') {
      // Admins/managers can see all deals, but can filter by specific owner if needed
      if (owner) {
        sql += ' AND d.owner_id = ?';
        countSql += ' AND d.owner_id = ?';
        params.push(owner);
        countParams.push(owner);
      }
    } else {
      // Regular users (rep, sdr, ae, or any other role) only see their own deals
      sql += ' AND d.owner_id = ?';
      countSql += ' AND d.owner_id = ?';
      params.push(req.user.id);
      countParams.push(req.user.id);
    }

    // Filter by health score range
    if (health_score_min) {
      sql += ' AND d.health_score >= ?';
      countSql += ' AND d.health_score >= ?';
      params.push(parseInt(health_score_min));
      countParams.push(parseInt(health_score_min));
    }
    if (health_score_max) {
      sql += ' AND d.health_score <= ?';
      countSql += ' AND d.health_score <= ?';
      params.push(parseInt(health_score_max));
      countParams.push(parseInt(health_score_max));
    }

    // Filter by search term
    if (search) {
      sql += ' AND (d.name LIKE ? OR d.company_name LIKE ? OR d.industry LIKE ? OR d.email LIKE ?)';
      countSql += ' AND (d.name LIKE ? OR d.company_name LIKE ? OR d.industry LIKE ? OR d.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Filter archived
    if (archived === 'true') {
      sql += ' AND d.is_archived = 1';
      countSql += ' AND d.is_archived = 1';
    } else {
      sql += ' AND d.is_archived = 0';
      countSql += ' AND d.is_archived = 0';
    }

    // Filter by deal list
    if (list) {
      sql += ' AND d.id IN (SELECT deal_id FROM deal_list_items WHERE deal_list_id = ?)';
      countSql += ' AND d.id IN (SELECT deal_id FROM deal_list_items WHERE deal_list_id = ?)';
      params.push(list);
      countParams.push(list);
    }

    // Filter by date (today, this_week)
    if (date_filter === 'today') {
      sql += ' AND DATE(d.created_at) = DATE(\'now\')';
      countSql += ' AND DATE(d.created_at) = DATE(\'now\')';
    } else if (date_filter === 'this_week') {
      // Get deals created in the last 7 days (including today)
      sql += ' AND d.created_at >= DATE(\'now\', \'-7 days\')';
      countSql += ' AND d.created_at >= DATE(\'now\', \'-7 days\')';
    }

    // Sort by column (whitelist allowed columns to prevent SQL injection)
    const allowedSortColumns = ['company_name', 'name', 'estimated_value', 'health_score', 'created_at', 'next_step_date', 'stage'];
    const sortColumn = allowedSortColumns.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY d.${sortColumn} ${sortDirection}`;

    // Add pagination
    sql += ` LIMIT ? OFFSET ?`;
    params.push(pageSize, offset);

    // Get total count and deals
    const countResult = await get(countSql, countParams);
    const total = countResult?.total || 0;
    const deals = await all(sql, params);
    const totalPages = Math.ceil(total / pageSize);

    res.json({
      deals,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Error fetching deals:', error);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

// GET /api/deals/kanban - Get deals grouped by stage for Kanban view with stagnation info
router.get('/kanban', async (req, res) => {
  try {
    // Single query with LEFT JOIN - fetches all deals + last stage change in one go
    // (Previously this was N+1: one query per deal for stagnation, causing Neon timeouts)
    let sql = `
      SELECT d.id, d.name, d.company_name, d.stage, d.estimated_value,
        d.health_score, d.priority, d.next_step_date, d.created_at,
        d.owner_id, d.job_title,
        u.name as owner_name,
        lsc.last_change as last_stage_change_date
      FROM deals d
      LEFT JOIN users u ON d.owner_id = u.id
      LEFT JOIN (
        SELECT deal_id, MAX(created_at) as last_change
        FROM activities
        WHERE activity_type = 'stage_changed'
        GROUP BY deal_id
      ) lsc ON lsc.deal_id = d.id
      WHERE d.is_archived = 0
    `;
    const params = [];

    // Filter by owner: Admins and managers can see all deals, others only their own
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      sql += ' AND d.owner_id = ?';
      params.push(req.user.id);
    }

    sql += ' ORDER BY d.health_score DESC, d.created_at DESC';

    const deals = await all(sql, params);

    // Calculate stagnation in-memory (no extra queries)
    const stages = ['new_signal', 'qualified', 'discovery', 'solution_design', 'negotiation', 'closed_won', 'closed_lost'];
    const closedStages = new Set(['closed_won', 'closed_lost']);
    const CLOSED_LIMIT = 10;
    const kanbanData = {};
    const closedCounts = {};

    stages.forEach(stage => { kanbanData[stage] = []; });

    for (const deal of deals) {
      const lastChangeDate = deal.last_stage_change_date || deal.created_at;
      const daysSinceChange = Math.floor(
        (Date.now() - new Date(lastChangeDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      let stagnationStatus = 'normal';
      if (daysSinceChange >= 20) {
        stagnationStatus = 'critical';
      } else if (daysSinceChange >= 10) {
        stagnationStatus = 'warning';
      }

      const enrichedDeal = {
        ...deal,
        days_in_stage: daysSinceChange,
        stagnation_status: stagnationStatus,
        last_stage_change: lastChangeDate
      };

      const stage = deal.stage;
      if (kanbanData[stage]) {
        // For closed stages, only keep first CLOSED_LIMIT deals (already sorted by health/date)
        if (closedStages.has(stage)) {
          closedCounts[stage] = (closedCounts[stage] || 0) + 1;
          if (kanbanData[stage].length < CLOSED_LIMIT) {
            kanbanData[stage].push(enrichedDeal);
          }
        } else {
          kanbanData[stage].push(enrichedDeal);
        }
      }
    }

    res.json({
      stages: kanbanData,
      closedCounts,
      total: deals.length
    });
  } catch (error) {
    console.error('Error fetching Kanban data:', error);
    res.status(500).json({ error: 'Failed to fetch Kanban data' });
  }
});

// POST /api/deals - Create a new deal
router.post('/', async (req, res) => {
  try {
    const {
      name,
      job_title,
      email,
      phone,
      linkedin_url,
      company_name,
      company_url,
      industry,
      stage = 'new_signal',
      estimated_value,
      close_date,
      compelling_event_date,
      next_step_date,
      next_step_description,
      priority = 'medium',
      source = 'manual'
    } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Validate text length
    if (company_name && company_name.length < 2) {
      return res.status(400).json({ error: 'Company name must be at least 2 characters' });
    }
    if (company_name && company_name.length > 255) {
      return res.status(400).json({ error: 'Company name must not exceed 255 characters' });
    }

    // Validate industry length if provided
    if (industry && industry.length > 100) {
      return res.status(400).json({ error: 'Industry must not exceed 100 characters' });
    }

    // Validate next_step_description length if provided
    if (next_step_description && next_step_description.length > 1000) {
      return res.status(400).json({ error: 'Next step description must not exceed 1000 characters' });
    }

    if (!next_step_date) {
      return res.status(400).json({ error: 'Next step date is required' });
    }

    // Validate stage
    const validStages = ['new_signal', 'qualified', 'discovery', 'solution_design', 'negotiation', 'closed_won', 'closed_lost'];
    if (!validStages.includes(stage)) {
      return res.status(400).json({ error: 'Invalid stage' });
    }

    // Validate priority
    const validPriorities = ['low', 'medium', 'high'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority' });
    }

    const dealId = uuidv4();

    await run(
      `INSERT INTO deals (
        id, name, job_title, email, phone, linkedin_url,
        company_name, company_url, industry, stage, estimated_value, close_date,
        compelling_event_date, next_step_date, next_step_description,
        health_score, owner_id, source, priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dealId,
        name,
        job_title || null,
        email || null,
        phone || null,
        linkedin_url || null,
        company_name || null,
        company_url || null,
        industry || null,
        stage,
        estimated_value || null,
        close_date || null,
        compelling_event_date || null,
        next_step_date,
        next_step_description || null,
        50, // Initial health score
        req.user.id,
        source,
        priority
      ]
    );

    // Create activity log
    await run(
      `INSERT INTO activities (id, deal_id, activity_type, description, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), dealId, 'deal_created', `Deal created for ${name}`, req.user.id]
    );

    // Fetch the created deal
    const deal = await get(
      `SELECT d.*, u.name as owner_name, u.email as owner_email
       FROM deals d
       LEFT JOIN users u ON d.owner_id = u.id
       WHERE d.id = ?`,
      [dealId]
    );

    res.status(201).json({ deal, message: 'Deal created successfully' });
  } catch (error) {
    console.error('Error creating deal:', error);
    res.status(500).json({ error: 'Failed to create deal' });
  }
});

// GET /api/deals/:id - Get a specific deal
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deal = await get(
      `SELECT d.*, u.name as owner_name, u.email as owner_email
       FROM deals d
       LEFT JOIN users u ON d.owner_id = u.id
       WHERE d.id = ?`,
      [id]
    );

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Check authorization: owner, manager, or admin can access
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && deal.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get activities for this deal
    const activities = await all(
      `SELECT a.*, u.name as created_by_name
       FROM activities a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.deal_id = ?
       ORDER BY a.created_at DESC`,
      [id]
    );

    // Get transcripts for this deal
    const transcripts = await all(
      `SELECT id, file_name, source_platform, processed, created_at
       FROM transcripts
       WHERE deal_id = ?
       ORDER BY created_at DESC`,
      [id]
    );

    // Get sales room if exists
    const salesRoom = await get(
      `SELECT id, public_url_slug, template_type, created_at
       FROM sales_rooms
       WHERE deal_id = ?`,
      [id]
    );

    // Calculate real-time health score
    const calculatedHealthScore = await calculateHealthScore(deal);
    if (calculatedHealthScore !== deal.health_score) {
      await run('UPDATE deals SET health_score = ? WHERE id = ?', [calculatedHealthScore, id]);
      deal.health_score = calculatedHealthScore;
    }

    res.json({
      deal,
      activities,
      transcripts,
      salesRoom
    });
  } catch (error) {
    console.error('Error fetching deal:', error);
    res.status(500).json({ error: 'Failed to fetch deal' });
  }
});

// PUT /api/deals/:id - Update a deal
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // First fetch the deal
    const existingDeal = await get('SELECT * FROM deals WHERE id = ?', [id]);

    if (!existingDeal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Check authorization: only owner or admin can edit (manager has read-only)
    if (req.user.role !== 'admin' && existingDeal.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. Only the deal owner can edit.' });
    }

    const {
      name,
      job_title,
      email,
      phone,
      linkedin_url,
      company_name,
      company_url,
      industry,
      stage,
      estimated_value,
      close_date,
      compelling_event_date,
      next_step_date,
      next_step_description,
      priority,
      lost_reason,
      is_archived,
      health_score,
      has_decision_maker,
      has_confirmed_budget
    } = req.body;

    // Validate person fields
    if (name !== undefined && !name) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    // Validate text length
    if (company_name !== undefined && company_name && company_name.length < 2) {
      return res.status(400).json({ error: 'Company name must be at least 2 characters' });
    }
    if (company_name !== undefined && company_name && company_name.length > 255) {
      return res.status(400).json({ error: 'Company name must not exceed 255 characters' });
    }
    if (industry !== undefined && industry && industry.length > 100) {
      return res.status(400).json({ error: 'Industry must not exceed 100 characters' });
    }
    if (next_step_description !== undefined && next_step_description && next_step_description.length > 1000) {
      return res.status(400).json({ error: 'Next step description must not exceed 1000 characters' });
    }

    if (next_step_date !== undefined && !next_step_date) {
      return res.status(400).json({ error: 'Next step date is required' });
    }

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (job_title !== undefined) {
      updates.push('job_title = ?');
      params.push(job_title);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      params.push(email);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone);
    }
    if (linkedin_url !== undefined) {
      updates.push('linkedin_url = ?');
      params.push(linkedin_url);
    }
    if (company_name !== undefined) {
      updates.push('company_name = ?');
      params.push(company_name);
    }
    if (company_url !== undefined) {
      updates.push('company_url = ?');
      params.push(company_url);
    }
    if (industry !== undefined) {
      updates.push('industry = ?');
      params.push(industry);
    }
    if (stage !== undefined) {
      const validStages = ['new_signal', 'qualified', 'discovery', 'solution_design', 'negotiation', 'closed_won', 'closed_lost'];
      if (!validStages.includes(stage)) {
        return res.status(400).json({ error: 'Invalid stage' });
      }
      updates.push('stage = ?');
      params.push(stage);

      // Log stage change
      if (stage !== existingDeal.stage) {
        await run(
          `INSERT INTO activities (id, deal_id, activity_type, description, metadata, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            id,
            'stage_changed',
            `Stage changed from ${existingDeal.stage} to ${stage}`,
            JSON.stringify({ from: existingDeal.stage, to: stage }),
            req.user.id
          ]
        );
      }
    }
    if (estimated_value !== undefined) {
      updates.push('estimated_value = ?');
      params.push(estimated_value);
    }
    if (close_date !== undefined) {
      updates.push('close_date = ?');
      params.push(close_date);
    }
    if (compelling_event_date !== undefined) {
      updates.push('compelling_event_date = ?');
      params.push(compelling_event_date);
    }
    if (next_step_date !== undefined) {
      updates.push('next_step_date = ?');
      params.push(next_step_date);
    }
    if (next_step_description !== undefined) {
      updates.push('next_step_description = ?');
      params.push(next_step_description);
    }
    if (priority !== undefined) {
      const validPriorities = ['low', 'medium', 'high'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({ error: 'Invalid priority' });
      }
      updates.push('priority = ?');
      params.push(priority);
    }
    if (lost_reason !== undefined) {
      updates.push('lost_reason = ?');
      params.push(lost_reason);
    }
    if (is_archived !== undefined) {
      updates.push('is_archived = ?');
      params.push(is_archived ? 1 : 0);
    }
    if (health_score !== undefined) {
      const score = parseInt(health_score);
      if (isNaN(score) || score < 0 || score > 100) {
        return res.status(400).json({ error: 'Health score must be between 0 and 100' });
      }
      updates.push('health_score = ?');
      params.push(score);
    }
    if (has_decision_maker !== undefined) {
      updates.push('has_decision_maker = ?');
      params.push(has_decision_maker ? 1 : 0);
    }
    if (has_confirmed_budget !== undefined) {
      updates.push('has_confirmed_budget = ?');
      params.push(has_confirmed_budget ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = datetime("now")');
    params.push(id);

    await run(
      `UPDATE deals SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // Fetch updated deal
    const deal = await get(
      `SELECT d.*, u.name as owner_name, u.email as owner_email
       FROM deals d
       LEFT JOIN users u ON d.owner_id = u.id
       WHERE d.id = ?`,
      [id]
    );

    // Recalculate health score based on real data
    const calculatedHealthScore = await calculateHealthScore(deal);
    if (calculatedHealthScore !== deal.health_score) {
      await run('UPDATE deals SET health_score = ? WHERE id = ?', [calculatedHealthScore, id]);
      deal.health_score = calculatedHealthScore;
    }

    // Create re-engagement task for "Timing" losses (3 months from now)
    if (stage === 'closed_lost' && existingDeal.stage !== 'closed_lost') {
      const finalLostReason = lost_reason || deal.lost_reason || '';
      if (finalLostReason.toLowerCase().includes('timing')) {
        // Calculate due date: 3 months from now
        const dueDate = new Date();
        dueDate.setMonth(dueDate.getMonth() + 3);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        // Check if a re-engagement task already exists for this deal
        const existingTask = await get(
          'SELECT id FROM tasks WHERE deal_id = ? AND type = ? AND is_completed = 0',
          [id, 're_engagement']
        );

        if (!existingTask) {
          const taskId = uuidv4();
          await run(
            `INSERT INTO tasks (id, deal_id, user_id, type, title, description, due_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              taskId,
              id,
              deal.owner_id,
              're_engagement',
              `Re-engage with ${deal.name}`,
              `This deal was lost due to timing. The 3-month re-engagement period has passed. Consider reaching out to see if their timeline has changed.`,
              dueDateStr
            ]
          );

          // Log activity
          await run(
            `INSERT INTO activities (id, deal_id, activity_type, description, metadata, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              uuidv4(),
              id,
              're_engagement_scheduled',
              `Re-engagement task scheduled for ${dueDateStr} (3 months)`,
              JSON.stringify({ task_id: taskId, due_date: dueDateStr, reason: 'timing' }),
              req.user.id
            ]
          );
        }
      }
    }

    res.json({ deal, message: 'Deal updated successfully' });
  } catch (error) {
    console.error('Error updating deal:', error);
    res.status(500).json({ error: 'Failed to update deal' });
  }
});

// DELETE /api/deals/batch/all - Delete all deals (double confirmation on frontend)
router.delete('/batch/all', async (req, res) => {
  try {
    const countResult = await get('SELECT COUNT(*) as count FROM deals');
    const count = countResult?.count || 0;

    if (count === 0) {
      return res.json({ message: 'No deals to delete', count: 0 });
    }

    // Clear deal_id in leads (FK without ON DELETE CASCADE)
    await run('UPDATE leads SET deal_id = NULL WHERE deal_id IS NOT NULL');

    await run('DELETE FROM deals');

    res.json({ message: 'All deals deleted', count });
  } catch (error) {
    console.error('Error deleting all deals:', error);
    res.status(500).json({ error: 'Failed to delete all deals' });
  }
});

// DELETE /api/deals/:id - Delete a deal
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // First fetch the deal
    const existingDeal = await get('SELECT * FROM deals WHERE id = ?', [id]);

    if (!existingDeal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Check authorization: only owner or admin can delete
    if (req.user.role !== 'admin' && existingDeal.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. Only the deal owner or admin can delete.' });
    }

    // Delete the deal (cascade will handle related records)
    await run('DELETE FROM deals WHERE id = ?', [id]);

    res.json({ message: 'Deal deleted successfully' });
  } catch (error) {
    console.error('Error deleting deal:', error);
    res.status(500).json({ error: 'Failed to delete deal' });
  }
});

// POST /api/deals/:id/transfer - Transfer deal to another user
router.post('/:id/transfer', async (req, res) => {
  try {
    const { id } = req.params;
    const { newOwnerId } = req.body;

    if (!newOwnerId) {
      return res.status(400).json({ error: 'New owner ID is required' });
    }

    // Fetch the deal
    const existingDeal = await get('SELECT * FROM deals WHERE id = ?', [id]);

    if (!existingDeal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Check authorization: owner, manager, or admin can transfer
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && existingDeal.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verify new owner exists
    const newOwner = await get('SELECT id, name, email FROM users WHERE id = ?', [newOwnerId]);
    if (!newOwner) {
      return res.status(400).json({ error: 'New owner not found' });
    }

    // Update the owner
    await run(
      'UPDATE deals SET owner_id = ?, updated_at = datetime("now") WHERE id = ?',
      [newOwnerId, id]
    );

    // Log the transfer
    await run(
      `INSERT INTO activities (id, deal_id, activity_type, description, metadata, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        id,
        'deal_transferred',
        `Deal transferred to ${newOwner.name}`,
        JSON.stringify({ fromOwnerId: existingDeal.owner_id, toOwnerId: newOwnerId }),
        req.user.id
      ]
    );

    // Create notification for new owner
    await createNotification(
      newOwnerId,
      'deal_transferred',
      `Deal "${existingDeal.name}" has been assigned to you by ${req.user.name}`,
      `/deals/${id}`
    );

    res.json({ message: `Deal transferred to ${newOwner.name}` });
  } catch (error) {
    console.error('Error transferring deal:', error);
    res.status(500).json({ error: 'Failed to transfer deal' });
  }
});

// GET /api/deals/:id/activities - Get deal activities
router.get('/:id/activities', async (req, res) => {
  try {
    const { id } = req.params;

    const activities = await all(
      `SELECT a.*, u.name as created_by_name
       FROM activities a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.deal_id = ?
       ORDER BY a.created_at DESC`,
      [id]
    );

    res.json({ activities });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// POST /api/deals/import/csv/preview - Preview CSV headers and detect mappings
router.post('/import/csv/preview', async (req, res) => {
  try {
    const { csvContent } = req.body;

    if (!csvContent) {
      return res.status(400).json({ error: 'CSV content is required' });
    }

    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV must have a header row and at least one data row' });
    }

    const headerLine = lines[0];
    const headers = parseCSVLine(headerLine).map(h => h.replace(/^"|"$/g, '').trim());
    const format = detectFormat(headers);
    const detectedMappings = detectColumnMappings(headers);

    // Parse up to 3 sample rows
    const sampleRows = [];
    for (let i = 1; i < Math.min(lines.length, 4); i++) {
      const line = lines[i].trim();
      if (!line) continue;
      sampleRows.push(parseCSVLine(line).map(v => v.replace(/^"|"$/g, '').trim()));
    }

    const totalRows = lines.filter((l, i) => i > 0 && l.trim()).length;

    const availableFields = Object.keys(COLUMN_PATTERNS);

    res.json({
      headers,
      detectedMappings,
      sampleRows,
      totalRows,
      format,
      availableFields,
    });
  } catch (error) {
    console.error('Error previewing CSV:', error);
    res.status(500).json({ error: 'Failed to preview CSV' });
  }
});

// POST /api/deals/import/csv - Import deals from CSV
router.post('/import/csv', async (req, res) => {
  try {
    const { csvContent, columnMappings, listId, createList, listName } = req.body;

    if (!csvContent) {
      return res.status(400).json({ error: 'CSV content is required' });
    }

    // Parse CSV content
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV must have a header row and at least one data row' });
    }

    // Parse header
    const headerLine = lines[0];
    const rawHeaders = parseCSVLine(headerLine).map(h => h.replace(/^"|"$/g, '').trim());
    let headers = rawHeaders.map(h => h.toLowerCase());

    // Detect if this is LinkedIn Sales Navigator export
    const linkedInSignatures = ['linkedin name', 'sales navigator profile link', 'organisation'];
    const isLinkedInFormat = linkedInSignatures.some(sig => headers.includes(sig));

    console.log(`CSV Format detected: ${isLinkedInFormat ? 'LinkedIn Sales Navigator' : 'Standard'}`);

    // Determine column indices - use provided mappings or auto-detect
    let mappings;
    if (columnMappings && Object.keys(columnMappings).length > 0) {
      // Use provided mappings (values are column indices)
      mappings = {};
      for (const [field, index] of Object.entries(columnMappings)) {
        if (index >= 0) {
          mappings[field] = index;
        }
      }
    } else {
      // Preprocess LinkedIn headers for auto-detection
      if (isLinkedInFormat) {
        const linkedInMap = new Map([
          ['first name', 'first_name_temp'],
          ['last name', 'last_name_temp'],
          ['linkedin name', 'linkedin_name_temp'],
          ['organisation', 'company name'],
          ['organisation website', 'company_url_temp'],
          ['current role(s)', 'job title'],
          ['sales navigator profile link', 'linkedin url'],
          ['profile link', 'linkedin_url_alt_temp'],
          ['about', 'about_temp'],
          ['location', 'location_temp'],
          ['organisation size', 'company_size_temp']
        ]);
        headers = headers.map(h => linkedInMap.get(h) || h);
      }

      // Auto-detect with extended patterns
      mappings = detectColumnMappings(headers);

      // LinkedIn-specific: add temp fields for name composition
      if (isLinkedInFormat) {
        const firstNameIdx = headers.indexOf('first_name_temp');
        const lastNameIdx = headers.indexOf('last_name_temp');
        const linkedinNameIdx = headers.indexOf('linkedin_name_temp');
        if (firstNameIdx >= 0) mappings._first_name_temp = firstNameIdx;
        if (lastNameIdx >= 0) mappings._last_name_temp = lastNameIdx;
        if (linkedinNameIdx >= 0) mappings._linkedin_name_temp = linkedinNameIdx;

        const aboutIdx = headers.indexOf('about_temp');
        if (aboutIdx >= 0) mappings._about_temp = aboutIdx;

        // Map company_url from temp
        const companyUrlIdx = headers.indexOf('company_url_temp');
        if (companyUrlIdx >= 0 && !mappings.company_url) mappings.company_url = companyUrlIdx;
      }
    }

    const nameIndex = mappings.name ?? -1;
    const firstNameIndex = mappings.first_name ?? mappings._first_name_temp ?? -1;
    const lastNameIndex = mappings.last_name ?? mappings._last_name_temp ?? -1;
    const jobTitleIndex = mappings.job_title ?? -1;
    const emailIndex = mappings.email ?? -1;
    const phoneIndex = mappings.phone ?? -1;
    const linkedinUrlIndex = mappings.linkedin_url ?? -1;
    const companyNameIndex = mappings.company_name ?? -1;
    const companyUrlIndex = mappings.company_url ?? -1;
    const industryIndex = mappings.industry ?? -1;
    const stageIndex = mappings.stage ?? -1;
    const valueIndex = mappings.estimated_value ?? -1;
    const closeDateIndex = mappings.close_date ?? -1;
    const nextStepDateIndex = mappings.next_step_date ?? -1;
    const nextStepDescIndex = mappings.next_step_description ?? -1;
    const priorityIndex = mappings.priority ?? -1;
    const linkedinNameIndex = mappings._linkedin_name_temp ?? -1;
    const aboutIndex = mappings._about_temp ?? -1;

    const validStages = ['new_signal', 'qualified', 'discovery', 'solution_design', 'negotiation', 'closed_won', 'closed_lost'];
    const validPriorities = ['low', 'medium', 'high'];

    const createdDeals = [];
    const errors = [];

    // Process data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = parseCSVLine(line);

      // Skip locked rows from LinkedIn (contains LOCKED text or lock emoji)
      if (isLinkedInFormat && values.length > 0) {
        const firstValue = values[0] || '';
        if (firstValue.includes('LOCKED') || firstValue.includes('🔒')) {
          console.log(`Skipping locked row ${i + 1}`);
          continue;
        }
      }

      const getVal = (idx) => idx >= 0 ? values[idx]?.replace(/^"|"$/g, '').trim() || null : null;

      // Determine contact name with fallback chain
      let contactName = getVal(nameIndex);
      if (!contactName) {
        const firstName = getVal(firstNameIndex) || '';
        const lastName = getVal(lastNameIndex) || '';
        if (firstName || lastName) {
          contactName = [firstName, lastName].filter(Boolean).join(' ');
        }
      }
      if (!contactName && linkedinNameIndex >= 0) {
        contactName = getVal(linkedinNameIndex);
      }
      if (!contactName) {
        contactName = getVal(companyNameIndex);
      }
      if (!contactName) {
        contactName = `Unknown (Row ${i + 1})`;
      }

      const jobTitle = getVal(jobTitleIndex);
      const csvEmail = getVal(emailIndex);
      const csvPhone = getVal(phoneIndex);
      const linkedinUrl = getVal(linkedinUrlIndex);
      const companyName = getVal(companyNameIndex);
      const companyUrl = getVal(companyUrlIndex);
      const aboutContent = isLinkedInFormat ? getVal(aboutIndex) : null;
      const industry = getVal(industryIndex);

      let stage = getVal(stageIndex);
      stage = stage ? stage.toLowerCase().replace(/ /g, '_') : 'new_signal';
      if (!validStages.includes(stage)) stage = 'new_signal';

      const rawValue = getVal(valueIndex);
      const estimatedValue = rawValue ? parseFloat(rawValue.replace(/[^0-9.]/g, '')) || null : null;
      const closeDate = getVal(closeDateIndex);
      const nextStepDate = getVal(nextStepDateIndex);
      const nextStepDesc = getVal(nextStepDescIndex);

      let priority = getVal(priorityIndex);
      priority = priority ? priority.toLowerCase() : 'medium';
      if (!validPriorities.includes(priority)) priority = 'medium';

      // Use current date + 30 days for next_step_date if not provided
      const defaultNextStepDate = new Date();
      defaultNextStepDate.setDate(defaultNextStepDate.getDate() + 30);
      const finalNextStepDate = nextStepDate || defaultNextStepDate.toISOString().split('T')[0];

      const dealId = uuidv4();

      try {
        await run(
          `INSERT INTO deals (
            id, name, job_title, email, phone, linkedin_url,
            company_name, company_url, industry, stage, estimated_value, close_date,
            next_step_date, next_step_description, health_score, owner_id, source, priority
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dealId,
            contactName,
            jobTitle,
            csvEmail,
            csvPhone,
            linkedinUrl,
            companyName,
            companyUrl,
            industry,
            stage,
            estimatedValue,
            closeDate,
            finalNextStepDate,
            nextStepDesc,
            50,
            req.user.id,
            'import',
            priority
          ]
        );

        // Create activity log
        await run(
          `INSERT INTO activities (id, deal_id, activity_type, description, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), dealId, 'deal_created', `Deal imported for ${contactName}`, req.user.id]
        );

        // Save LinkedIn About as a note if available
        if (isLinkedInFormat && aboutContent) {
          try {
            const noteId = uuidv4();
            await run(
              `INSERT INTO deal_notes (id, deal_id, content, created_by, created_at)
               VALUES (?, ?, ?, ?, datetime('now'))`,
              [noteId, dealId, `📝 LinkedIn Bio:\n\n${aboutContent}`, req.user.id]
            );
          } catch (noteErr) {
            console.error('Failed to save LinkedIn bio note:', noteErr);
          }
        }

        createdDeals.push({ id: dealId, name: contactName, company_name: companyName });
      } catch (err) {
        errors.push(`Row ${i + 1}: Failed to create deal for ${contactName} - ${err.message}`);
      }
    }

    // Handle list creation/assignment
    let assignedListId = listId || null;
    if (createList && createdDeals.length > 0) {
      const newListId = uuidv4();
      const newListName = listName || `Import - ${new Date().toISOString().split('T')[0]}`;
      try {
        await run(
          `INSERT INTO deal_lists (id, name, owner_id) VALUES (?, ?, ?)`,
          [newListId, newListName, req.user.id]
        );
        assignedListId = newListId;
      } catch (err) {
        console.error('Failed to create list for import:', err);
      }
    }

    // Assign deals to list
    if (assignedListId && createdDeals.length > 0) {
      for (const deal of createdDeals) {
        try {
          await run(
            `INSERT INTO deal_list_items (id, deal_list_id, deal_id) VALUES (?, ?, ?)`,
            [uuidv4(), assignedListId, deal.id]
          );
        } catch (err) {
          console.error(`Failed to assign deal ${deal.id} to list:`, err);
        }
      }
    }

    res.json({
      success: true,
      imported: createdDeals.length,
      format: isLinkedInFormat ? 'linkedin' : 'standard',
      deals: createdDeals,
      listId: assignedListId || undefined,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error importing deals:', error);
    res.status(500).json({ error: 'Failed to import deals' });
  }
});

// POST /api/deals/import/lix - Import deals from Lix IT Excel (.xlsx)
// Pre-populates research data with LinkedIn person info extracted by the Lix IT extension
router.post('/import/lix', async (req, res) => {
  try {
    const { xlsxBase64 } = req.body;

    if (!xlsxBase64) {
      return res.status(400).json({ error: 'Excel file content (xlsxBase64) is required' });
    }

    if (xlsxBase64.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large. Maximum 10MB.' });
    }

    // Parse xlsx
    const buffer = Buffer.from(xlsxBase64, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    // Validate Lix IT format by checking for known column signatures
    const columns = Object.keys(rows[0]);
    const hasLinkedInName = columns.some(c => c === 'LinkedIn Name');
    const hasOrganisation = columns.some(c => c === 'Organisation');
    const hasProfileLink = columns.some(c => c === 'Profile Link');

    if (!hasLinkedInName && !hasOrganisation && !hasProfileLink) {
      return res.status(400).json({
        error: 'This does not appear to be a Lix IT export. Expected columns: "LinkedIn Name", "Organisation", "Profile Link".',
      });
    }

    // Helper: normalize URL (add https:// if missing)
    function normalizeUrl(url) {
      if (!url || typeof url !== 'string') return null;
      url = url.trim();
      if (!url) return null;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      return url;
    }

    // Helper: parse "Title at Company" format from Current/Past Role(s)
    function parseRoles(roleStr) {
      if (!roleStr) return [];
      // Roles may be separated by semicolons or newlines
      return roleStr.split(/[;\n]+/).map(role => {
        const trimmed = role.trim();
        if (!trimmed) return null;
        const atMatch = trimmed.match(/^(.+?)\s+at\s+(.+)$/i);
        if (atMatch) {
          return { title: atMatch[1].trim(), company: atMatch[2].trim(), starts_at: null, ends_at: null, description: null };
        }
        return { title: trimmed, company: null, starts_at: null, ends_at: null, description: null };
      }).filter(Boolean);
    }

    // Helper: parse education (semicolon-separated school names)
    function parseEducation(eduStr) {
      if (!eduStr) return [];
      return eduStr.split(/[;\n]+/).map(e => {
        const trimmed = e.trim();
        if (!trimmed) return null;
        return { school: trimmed, degree_name: null, field_of_study: null };
      }).filter(Boolean).slice(0, 3);
    }

    // Default next_step_date: current date + 30 days
    const defaultNextStepDate = new Date();
    defaultNextStepDate.setDate(defaultNextStepDate.getDate() + 30);
    const nextStepDateStr = defaultNextStepDate.toISOString().split('T')[0];

    const createdDeals = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Extract fields from Lix IT columns
      const firstName = (row['First Name'] || '').trim();
      const lastName = (row['Last Name'] || '').trim();
      const fullName = `${firstName} ${lastName}`.trim() || (row['LinkedIn Name'] || '').trim();

      if (!fullName) {
        errors.push(`Row ${i + 2}: Name is empty — skipped`);
        continue;
      }

      const headline = (row['Description'] || '').trim() || null;
      const companyName = (row['Organisation'] || '').trim() || null;
      const companyUrl = normalizeUrl(row['Organisation Website']);
      const profileLink = normalizeUrl(row['Profile Link']);
      const industry = (row['Industry'] || '').trim() || null;
      const location = (row['Location'] || '').trim() || null;
      const about = (row['About'] || '').trim() || null;
      const currentRoles = (row['Current Role(s)'] || '').trim() || null;
      const pastRoles = (row['Past Role(s)'] || '').trim() || null;
      const education = (row['Education'] || '').trim() || null;
      const seniority = (row['Seniority'] || '').trim() || null;
      const jobFunction = (row['Job Function'] || '').trim() || null;
      const orgSize = (row['Organisation Size'] || '').trim() || null;

      // Determine job_title: prefer Description (headline), fallback to Current Role(s)
      const jobTitle = headline || currentRoles || null;

      const dealId = uuidv4();
      const researchProfileId = uuidv4();

      try {
        // 1. Create deal
        await run(
          `INSERT INTO deals (
            id, name, job_title, email, phone, linkedin_url,
            company_name, company_url, industry, stage, estimated_value, close_date,
            next_step_date, next_step_description, health_score, owner_id, source, priority
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dealId,
            fullName,
            jobTitle,
            null, // email — not in Lix IT export
            null, // phone — not in Lix IT export
            profileLink,
            companyName,
            companyUrl,
            industry,
            'new_signal',
            null, // estimated_value
            null, // close_date
            nextStepDateStr,
            null, // next_step_description
            50,
            req.user.id,
            'import',
            'medium'
          ]
        );

        // 2. Build LinkedIn person data from Lix IT fields
        const experiences = [
          ...parseRoles(currentRoles),
          ...parseRoles(pastRoles),
        ].slice(0, 5);

        const personData = {
          full_name: fullName,
          headline: headline,
          summary: about,
          occupation: currentRoles || headline,
          city: location,
          country: null,
          connections: null,
          follower_count: null,
          linkedin_url: profileLink,
          profile_pic_url: null,
          experiences: experiences,
          education: parseEducation(education),
          skills: [],
          languages: [],
          seniority: seniority,
          job_function: jobFunction,
          _source: 'lix_import',
        };

        const linkedinData = JSON.stringify({
          company: null, // Will be fetched when user runs Deep Research
          person: personData,
        });

        // 3. Create research profile (pre-populated with person data)
        await run(
          `INSERT INTO research_profiles (
            id, lead_id, deal_id, status, linkedin_data,
            platforms_searched, platforms_succeeded,
            requested_by, created_at, updated_at, completed_at
          ) VALUES (?, NULL, ?, 'partial', ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))`,
          [
            researchProfileId,
            dealId,
            linkedinData,
            JSON.stringify(['linkedin']),
            JSON.stringify(['linkedin']),
            req.user.id,
          ]
        );

        // 4. Create social profile for LinkedIn
        await run(
          `INSERT INTO social_profiles (
            id, lead_id, deal_id, research_profile_id,
            platform, profile_url, username, display_name, bio, followers_count, profile_data
          ) VALUES (?, NULL, ?, ?, 'linkedin', ?, ?, ?, ?, NULL, ?)`,
          [
            uuidv4(),
            dealId,
            researchProfileId,
            profileLink,
            fullName,
            fullName,
            headline,
            JSON.stringify(personData),
          ]
        );

        // 5. Activity log
        await run(
          `INSERT INTO activities (id, deal_id, activity_type, description, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), dealId, 'deal_created', `Deal imported from Lix IT Excel for ${fullName}`, req.user.id]
        );

        createdDeals.push({ id: dealId, name: fullName, company_name: companyName });
      } catch (err) {
        errors.push(`Row ${i + 2}: Failed to create deal for ${fullName} — ${err.message}`);
      }
    }

    console.log(`Lix IT import: ${createdDeals.length} deals created, ${errors.length} errors`);

    res.json({
      success: true,
      imported: createdDeals.length,
      deals: createdDeals,
      source: 'lix_it',
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error importing Lix IT Excel:', error);
    res.status(500).json({ error: 'Failed to import Lix IT Excel: ' + error.message });
  }
});

// GET /api/deals/export/csv - Export deals to CSV
router.get('/export/csv', async (req, res) => {
  try {
    const { stage, owner, search } = req.query;

    let sql = `
      SELECT d.*, u.name as owner_name, u.email as owner_email
      FROM deals d
      LEFT JOIN users u ON d.owner_id = u.id
      WHERE d.is_archived = 0
    `;
    const params = [];

    // Filter by stage
    if (stage) {
      sql += ' AND d.stage = ?';
      params.push(stage);
    }

    // Filter by owner: Admins and managers can see all deals, others only their own
    if (req.user.role === 'admin' || req.user.role === 'manager') {
      // Admins/managers can export all deals, but can filter by specific owner if needed
      if (owner) {
        sql += ' AND d.owner_id = ?';
        params.push(owner);
      }
    } else {
      // Regular users can only export their own deals
      sql += ' AND d.owner_id = ?';
      params.push(req.user.id);
    }

    // Filter by search term
    if (search) {
      sql += ' AND (d.name LIKE ? OR d.company_name LIKE ? OR d.industry LIKE ? OR d.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY d.created_at DESC';

    const deals = await all(sql, params);

    // Create CSV content
    const headers = [
      'ID',
      'Name',
      'Job Title',
      'Email',
      'Phone',
      'LinkedIn URL',
      'Company Name',
      'Industry',
      'Stage',
      'Estimated Value',
      'Close Date',
      'Compelling Event Date',
      'Next Step Date',
      'Next Step Description',
      'Health Score',
      'Priority',
      'Owner',
      'Owner Email',
      'Created At',
      'Updated At'
    ];

    const rows = deals.map(deal => [
      deal.id,
      `"${(deal.name || '').replace(/"/g, '""')}"`,
      `"${(deal.job_title || '').replace(/"/g, '""')}"`,
      deal.email || '',
      deal.phone || '',
      deal.linkedin_url || '',
      `"${(deal.company_name || '').replace(/"/g, '""')}"`,
      `"${(deal.industry || '').replace(/"/g, '""')}"`,
      deal.stage,
      deal.estimated_value || '',
      deal.close_date || '',
      deal.compelling_event_date || '',
      deal.next_step_date || '',
      `"${(deal.next_step_description || '').replace(/"/g, '""')}"`,
      deal.health_score,
      deal.priority,
      `"${(deal.owner_name || '').replace(/"/g, '""')}"`,
      deal.owner_email || '',
      deal.created_at,
      deal.updated_at
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=deals-export-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting deals:', error);
    res.status(500).json({ error: 'Failed to export deals' });
  }
});

// POST /api/deals/:id/notes - Add note to deal
router.post('/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    // Verify deal exists
    const deal = await get('SELECT id FROM deals WHERE id = ?', [id]);
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const noteId = uuidv4();

    await run(
      `INSERT INTO activities (id, deal_id, activity_type, description, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [noteId, id, 'note', content, req.user.id]
    );

    const note = await get(
      `SELECT a.*, u.name as created_by_name
       FROM activities a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.id = ?`,
      [noteId]
    );

    res.status(201).json({ note, message: 'Note added successfully' });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// POST /api/deals/:id/autopsy - Run AI autopsy analysis on a lost deal
router.post('/:id/autopsy', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the deal
    const deal = await get(
      `SELECT d.*, u.name as owner_name
       FROM deals d
       LEFT JOIN users u ON d.owner_id = u.id
       WHERE d.id = ?`,
      [id]
    );

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Verify user has access (owner or manager)
    const isOwner = deal.owner_id === req.user.id;
    const isManager = ['manager', 'admin'].includes(req.user.role);
    if (!isOwner && !isManager) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verify deal is closed_lost
    if (deal.stage !== 'closed_lost') {
      return res.status(400).json({ error: 'Autopsy can only be run on deals with status "closed_lost"' });
    }

    // Fetch all activities for this deal
    const activities = await all(
      `SELECT activity_type, description, created_at FROM activities WHERE deal_id = ? ORDER BY created_at ASC`,
      [id]
    );

    // Fetch transcripts with insights
    const transcripts = await all(
      `SELECT file_name, insights, processed, created_at FROM transcripts WHERE deal_id = ? ORDER BY created_at ASC`,
      [id]
    );

    // Fetch sales room analytics if exists
    const salesRoom = await get(
      `SELECT id, public_url_slug FROM sales_rooms WHERE deal_id = ?`,
      [id]
    );

    let salesRoomAnalytics = [];
    if (salesRoom) {
      salesRoomAnalytics = await all(
        `SELECT section_viewed, visitor_role, time_spent_seconds, visited_at FROM sales_room_analytics WHERE sales_room_id = ? ORDER BY visited_at ASC`,
        [salesRoom.id]
      );
    }

    // Analyze the data to generate autopsy report
    const analysis = generateAutopsyAnalysis(deal, activities, transcripts, salesRoomAnalytics);

    // Log the autopsy action
    await run(
      `INSERT INTO activities (id, deal_id, activity_type, description, metadata, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        id,
        'autopsy_run',
        'AI autopsy analysis generated for lost deal',
        JSON.stringify({ analysisDate: new Date().toISOString() }),
        req.user.id
      ]
    );

    res.json({
      deal: {
        person_name: deal.name,
        company_name: deal.company_name,
        industry: deal.industry,
        estimated_value: deal.estimated_value,
        lost_reason: deal.lost_reason,
        stage_duration: calculateStageDuration(deal)
      },
      analysis,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error running deal autopsy:', error);
    res.status(500).json({ error: 'Failed to run autopsy analysis' });
  }
});

// Helper function to calculate stage duration
function calculateStageDuration(deal) {
  const created = new Date(deal.created_at);
  const now = new Date();
  const daysTotal = Math.floor((now - created) / (1000 * 60 * 60 * 24));
  return `${daysTotal} days in pipeline`;
}

// Helper function to generate autopsy analysis based on deal data
function generateAutopsyAnalysis(deal, activities, transcripts, salesRoomAnalytics) {
  const findings = [];
  const suggestions = [];
  let riskLevel = 'medium';

  // Analyze lost reason
  if (deal.lost_reason) {
    const reason = deal.lost_reason.toLowerCase();
    if (reason.includes('price') || reason.includes('budget') || reason.includes('cost')) {
      findings.push({
        category: 'Pricing',
        issue: 'Deal lost due to pricing concerns',
        detail: 'The prospect cited budget or cost as the primary objection.'
      });
      suggestions.push('Consider offering flexible payment terms or phased implementation');
      suggestions.push('Earlier budget qualification could have identified this risk');
    } else if (reason.includes('competitor') || reason.includes('competition')) {
      findings.push({
        category: 'Competition',
        issue: 'Lost to competitor',
        detail: 'A competing solution was chosen over ours.'
      });
      suggestions.push('Review battlecards and competitive positioning');
      suggestions.push('Conduct win/loss interview to understand competitive gaps');
    } else if (reason.includes('timing') || reason.includes('delay') || reason.includes('later')) {
      findings.push({
        category: 'Timing',
        issue: 'Deal lost due to timing issues',
        detail: 'The prospect was not ready to make a decision.'
      });
      suggestions.push('Set up nurture sequence for re-engagement in 3-6 months');
      suggestions.push('Earlier compelling event identification could help');
    } else if (reason.includes('ghost') || reason.includes('no response') || reason.includes('silent')) {
      findings.push({
        category: 'Engagement',
        issue: 'Prospect went silent',
        detail: 'Lost contact with the prospect during the sales cycle.'
      });
      suggestions.push('Implement multi-threading to engage multiple stakeholders');
      suggestions.push('Earlier identification of champion could prevent ghosting');
      riskLevel = 'high';
    } else {
      findings.push({
        category: 'General',
        issue: `Lost reason: ${deal.lost_reason}`,
        detail: 'Review the specific reason provided for this loss.'
      });
    }
  } else {
    findings.push({
      category: 'Documentation',
      issue: 'No lost reason recorded',
      detail: 'A specific reason for the loss was not documented.'
    });
    suggestions.push('Always document the specific reason when marking a deal as lost');
  }

  // Analyze activity timeline
  const noteCount = activities.filter(a => a.activity_type === 'note').length;
  const stageChangeCount = activities.filter(a => a.activity_type === 'stage_change' || a.activity_type.includes('stage')).length;

  if (noteCount < 3) {
    findings.push({
      category: 'Documentation',
      issue: 'Insufficient notes recorded',
      detail: `Only ${noteCount} notes were added during the sales cycle.`
    });
    suggestions.push('Document key conversations and insights more frequently');
  }

  if (activities.length > 0) {
    const firstActivity = new Date(activities[0].created_at);
    const lastActivity = new Date(activities[activities.length - 1].created_at);
    const activityGapDays = Math.floor((lastActivity - firstActivity) / (1000 * 60 * 60 * 24));

    // Check for long gaps between activities
    let maxGap = 0;
    for (let i = 1; i < activities.length; i++) {
      const prev = new Date(activities[i - 1].created_at);
      const curr = new Date(activities[i].created_at);
      const gap = Math.floor((curr - prev) / (1000 * 60 * 60 * 24));
      if (gap > maxGap) maxGap = gap;
    }

    if (maxGap > 14) {
      findings.push({
        category: 'Engagement',
        issue: 'Long gap in activity',
        detail: `There was a ${maxGap}-day gap between activities, which may indicate lost momentum.`
      });
      suggestions.push('Maintain consistent touchpoints (at least weekly) throughout the sales cycle');
      riskLevel = 'high';
    }
  }

  // Analyze transcripts
  if (transcripts.length === 0) {
    findings.push({
      category: 'Discovery',
      issue: 'No discovery transcripts uploaded',
      detail: 'No meeting transcripts were processed for this deal.'
    });
    suggestions.push('Upload and analyze discovery call transcripts to identify pain points');
  } else {
    let hasRedFlags = false;
    let hasPainPoints = false;
    let hasStakeholders = false;

    transcripts.forEach(t => {
      if (t.insights) {
        try {
          const insights = JSON.parse(t.insights);
          if (insights.red_flags && insights.red_flags.length > 0) hasRedFlags = true;
          if (insights.pain_points && insights.pain_points.length > 0) hasPainPoints = true;
          if (insights.stakeholders && insights.stakeholders.length > 0) hasStakeholders = true;
        } catch (e) {
          // Invalid JSON
        }
      }
    });

    if (hasRedFlags) {
      findings.push({
        category: 'Risk Signals',
        issue: 'Red flags were identified in transcripts',
        detail: 'Discovery analysis detected warning signs that may have contributed to the loss.'
      });
      suggestions.push('Address red flags immediately when detected in discovery calls');
    }

    if (!hasPainPoints) {
      findings.push({
        category: 'Discovery',
        issue: 'No clear pain points extracted',
        detail: 'The discovery analysis did not identify strong pain points.'
      });
      suggestions.push('Focus on uncovering and quantifying specific business problems');
    }

    if (!hasStakeholders) {
      findings.push({
        category: 'Stakeholder Mapping',
        issue: 'No stakeholders identified',
        detail: 'Key decision makers were not mapped during discovery.'
      });
      suggestions.push('Identify and engage all buying committee members early');
    }
  }

  // Analyze Sales Room engagement
  if (salesRoomAnalytics.length > 0) {
    const totalTimeSpent = salesRoomAnalytics.reduce((sum, a) => sum + (a.time_spent_seconds || 0), 0);
    const sectionsViewed = [...new Set(salesRoomAnalytics.map(a => a.section_viewed))];

    if (totalTimeSpent < 120) {
      findings.push({
        category: 'Engagement',
        issue: 'Low Sales Room engagement',
        detail: `Prospect spent only ${Math.round(totalTimeSpent / 60)} minutes in the Sales Room.`
      });
      suggestions.push('Follow up on Sales Room views with targeted questions');
    }

    if (!sectionsViewed.includes('cfo')) {
      findings.push({
        category: 'Stakeholder Engagement',
        issue: 'CFO section not viewed',
        detail: 'The financial decision maker may not have reviewed the ROI analysis.'
      });
      suggestions.push('Ensure economic buyers receive and review the business case');
    }
  }

  // Calculate overall risk score
  const riskScore = findings.length > 5 ? 'high' : findings.length > 3 ? 'medium' : 'low';

  return {
    summary: `This deal was lost after ${calculateStageDuration(deal).replace(' in pipeline', '')} in the pipeline. ${findings.length} potential contributing factors were identified.`,
    risk_level: riskScore,
    findings,
    suggestions: [...new Set(suggestions)].slice(0, 5), // Dedupe and limit to 5 suggestions
    reengagement_potential: determineReengagementPotential(deal, findings)
  };
}

// Helper function to determine re-engagement potential
function determineReengagementPotential(deal, findings) {
  const reason = (deal.lost_reason || '').toLowerCase();

  if (reason.includes('timing') || reason.includes('budget cycle') || reason.includes('later')) {
    return {
      score: 'high',
      recommendation: 'Re-engage in 3-6 months when timing may be more favorable',
      suggested_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };
  }

  if (reason.includes('ghost') || reason.includes('no response')) {
    return {
      score: 'low',
      recommendation: 'Low re-engagement potential - consider a different entry point or contact',
      suggested_date: null
    };
  }

  if (reason.includes('competitor')) {
    return {
      score: 'medium',
      recommendation: 'Monitor for dissatisfaction with competitor solution in 6-12 months',
      suggested_date: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };
  }

  return {
    score: 'medium',
    recommendation: 'Consider re-engagement after addressing identified issues',
    suggested_date: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  };
}

// GET /api/deals/tasks - Get all tasks (especially re-engagement tasks)
router.get('/tasks/list', async (req, res) => {
  try {
    const { type, due_before, include_completed } = req.query;

    let sql = `
      SELECT t.*, d.company_name, d.stage, d.lost_reason, u.name as user_name
      FROM tasks t
      LEFT JOIN deals d ON t.deal_id = d.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // Filter by type
    if (type) {
      sql += ' AND t.type = ?';
      params.push(type);
    }

    // Filter by due date
    if (due_before) {
      sql += ' AND t.due_date <= ?';
      params.push(due_before);
    }

    // Filter completed tasks
    if (include_completed !== 'true') {
      sql += ' AND t.is_completed = 0';
    }

    // Filter by user: Admins and managers can see all tasks, others only their own
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      sql += ' AND t.user_id = ?';
      params.push(req.user.id);
    }

    sql += ' ORDER BY t.due_date ASC';

    const tasks = await all(sql, params);

    res.json({ tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// GET /api/deals/tasks/due - Get tasks that are due (for re-engagement testing)
router.get('/tasks/due', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const tasks = await all(`
      SELECT t.*, d.company_name, d.stage, d.lost_reason, u.name as user_name
      FROM tasks t
      LEFT JOIN deals d ON t.deal_id = d.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.is_completed = 0
        AND t.due_date <= ?
      ORDER BY t.due_date ASC
    `, [today]);

    res.json({
      tasks,
      today,
      count: tasks.length
    });
  } catch (error) {
    console.error('Error fetching due tasks:', error);
    res.status(500).json({ error: 'Failed to fetch due tasks' });
  }
});

// POST /api/deals/tasks/:id/complete - Mark a task as completed
router.post('/tasks/:taskId/complete', async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check authorization
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && task.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await run(
      'UPDATE tasks SET is_completed = 1, completed_at = datetime("now") WHERE id = ?',
      [taskId]
    );

    res.json({ message: 'Task marked as completed' });
  } catch (error) {
    console.error('Error completing task:', error);
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

// POST /api/deals/tasks/simulate-time - Simulate time passing (for testing re-engagement)
// This endpoint moves a task's due date to today for testing purposes
router.post('/tasks/simulate-time', async (req, res) => {
  try {
    const { task_id, months_forward } = req.body;

    if (!task_id) {
      return res.status(400).json({ error: 'Task ID is required' });
    }

    const task = await get('SELECT * FROM tasks WHERE id = ?', [task_id]);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // For testing, we simulate time by moving the task's due date back
    // (i.e., making it as if X months have passed)
    const monthsToSimulate = parseInt(months_forward) || 3;
    const today = new Date().toISOString().split('T')[0];

    // Calculate what the due date would be if months_forward had passed
    // We want the task to appear as "due" now, so we set due_date to today or earlier
    const newDueDate = new Date();
    newDueDate.setDate(newDueDate.getDate() - 1); // Make it due yesterday for immediate visibility
    const newDueDateStr = newDueDate.toISOString().split('T')[0];

    await run(
      'UPDATE tasks SET due_date = ? WHERE id = ?',
      [newDueDateStr, task_id]
    );

    // Log activity
    await run(
      `INSERT INTO activities (id, deal_id, activity_type, description, metadata, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        task.deal_id,
        'time_simulated',
        `Time simulation: ${monthsToSimulate} months forward - task now due`,
        JSON.stringify({ task_id, original_due_date: task.due_date, new_due_date: newDueDateStr }),
        req.user.id
      ]
    );

    const updatedTask = await get(`
      SELECT t.*, d.company_name, d.stage, d.lost_reason
      FROM tasks t
      LEFT JOIN deals d ON t.deal_id = d.id
      WHERE t.id = ?
    `, [task_id]);

    res.json({
      message: `Time simulated: ${monthsToSimulate} months forward. Task is now due.`,
      task: updatedTask,
      original_due_date: task.due_date,
      new_due_date: newDueDateStr
    });
  } catch (error) {
    console.error('Error simulating time:', error);
    res.status(500).json({ error: 'Failed to simulate time' });
  }
});

// POST /api/deals/archive/run - Run the auto-archive job for inactive deals
// Archives deals that have been inactive (no activity) for 12+ months
router.post('/archive/run', async (req, res) => {
  try {
    // Find deals that are:
    // 1. Not already archived
    // 2. Have no activity in the last 12 months
    // 3. Are not in active stages (closed_won, closed_lost are archive candidates)
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 12);
    const cutoffDateStr = cutoffDate.toISOString();

    // Get deals with their most recent activity
    const inactiveDeals = await all(`
      SELECT d.*,
             MAX(a.created_at) as last_activity,
             (SELECT MAX(created_at) FROM activities WHERE deal_id = d.id) as last_activity_date
      FROM deals d
      LEFT JOIN activities a ON a.deal_id = d.id
      WHERE d.is_archived = 0
      GROUP BY d.id
      HAVING last_activity_date IS NULL OR last_activity_date < ?
    `, [cutoffDateStr]);

    const archivedDeals = [];

    for (const deal of inactiveDeals) {
      // Archive the deal
      await run('UPDATE deals SET is_archived = 1, updated_at = datetime("now") WHERE id = ?', [deal.id]);

      // Log the activity
      await run(
        `INSERT INTO activities (id, deal_id, activity_type, description, metadata, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          deal.id,
          'auto_archived',
          `Deal auto-archived due to 12+ months of inactivity`,
          JSON.stringify({ last_activity: deal.last_activity_date, cutoff_date: cutoffDateStr }),
          req.user.id
        ]
      );

      archivedDeals.push({
        id: deal.id,
        company_name: deal.company_name,
        last_activity: deal.last_activity_date
      });
    }

    res.json({
      message: `Auto-archive job completed. ${archivedDeals.length} deals archived.`,
      archived_count: archivedDeals.length,
      archived_deals: archivedDeals,
      cutoff_date: cutoffDateStr
    });
  } catch (error) {
    console.error('Error running archive job:', error);
    res.status(500).json({ error: 'Failed to run archive job' });
  }
});

// POST /api/deals/:id/simulate-inactivity - Simulate inactivity for a deal (for testing)
// Sets the deal's last activity date to 13 months ago
router.post('/:id/simulate-inactivity', async (req, res) => {
  try {
    const { id } = req.params;
    const { months_inactive } = req.body;

    const deal = await get('SELECT * FROM deals WHERE id = ?', [id]);
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const monthsToSimulate = parseInt(months_inactive) || 13;
    const simulatedDate = new Date();
    simulatedDate.setMonth(simulatedDate.getMonth() - monthsToSimulate);
    const simulatedDateStr = simulatedDate.toISOString();

    // Update all activities for this deal to appear as if they happened long ago
    await run(
      'UPDATE activities SET created_at = ? WHERE deal_id = ?',
      [simulatedDateStr, id]
    );

    // Also update the deal's updated_at and created_at
    await run(
      'UPDATE deals SET updated_at = ?, created_at = ? WHERE id = ?',
      [simulatedDateStr, simulatedDateStr, id]
    );

    // Log that we simulated inactivity (this log entry will have current timestamp)
    await run(
      `INSERT INTO activities (id, deal_id, activity_type, description, metadata, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        id,
        'inactivity_simulated',
        `Simulated ${monthsToSimulate} months of inactivity for testing`,
        JSON.stringify({ months_simulated: monthsToSimulate, simulated_date: simulatedDateStr }),
        req.user.id
      ]
    );

    // Now update that log entry to also appear old (so it doesn't prevent archiving)
    await run(
      'UPDATE activities SET created_at = ? WHERE deal_id = ? AND activity_type = ?',
      [simulatedDateStr, id, 'inactivity_simulated']
    );

    res.json({
      message: `Simulated ${monthsToSimulate} months of inactivity for deal ${deal.name}`,
      deal_id: id,
      person_name: deal.name,
      simulated_last_activity: simulatedDateStr
    });
  } catch (error) {
    console.error('Error simulating inactivity:', error);
    res.status(500).json({ error: 'Failed to simulate inactivity' });
  }
});

export default router;
