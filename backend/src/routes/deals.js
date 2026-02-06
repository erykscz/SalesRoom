import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { get, run, all } from '../db/database.js';
import { createNotification } from './notifications.js';
import { calculateHealthScore } from '../utils/healthScore.js';

const router = express.Router();

// GET /api/deals - List all deals
router.get('/', async (req, res) => {
  try {
    const { stage, owner, health_score_min, health_score_max, search, archived, sort_by, sort_order, page, limit, date_filter } = req.query;

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

    // Filter by owner (managers can see all, reps can only see their own)
    if (req.user.role === 'rep' || req.user.role === 'sdr' || req.user.role === 'ae') {
      sql += ' AND d.owner_id = ?';
      countSql += ' AND d.owner_id = ?';
      params.push(req.user.id);
      countParams.push(req.user.id);
    } else if (owner) {
      sql += ' AND d.owner_id = ?';
      countSql += ' AND d.owner_id = ?';
      params.push(owner);
      countParams.push(owner);
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
      sql += ' AND (d.company_name LIKE ? OR d.industry LIKE ?)';
      countSql += ' AND (d.company_name LIKE ? OR d.industry LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
      countParams.push(`%${search}%`, `%${search}%`);
    }

    // Filter archived
    if (archived === 'true') {
      sql += ' AND d.is_archived = 1';
      countSql += ' AND d.is_archived = 1';
    } else {
      sql += ' AND d.is_archived = 0';
      countSql += ' AND d.is_archived = 0';
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
    const allowedSortColumns = ['company_name', 'estimated_value', 'health_score', 'created_at', 'next_step_date', 'stage'];
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
    // Get all active (non-archived) deals
    let sql = `
      SELECT d.*, u.name as owner_name, u.email as owner_email
      FROM deals d
      LEFT JOIN users u ON d.owner_id = u.id
      WHERE d.is_archived = 0
    `;
    const params = [];

    // Filter by owner for non-managers
    if (req.user.role === 'rep' || req.user.role === 'sdr' || req.user.role === 'ae') {
      sql += ' AND d.owner_id = ?';
      params.push(req.user.id);
    }

    sql += ' ORDER BY d.health_score DESC, d.created_at DESC';

    const deals = await all(sql, params);

    // For each deal, calculate days since last stage change
    const dealsWithStagnation = await Promise.all(deals.map(async (deal) => {
      // Find the last stage_changed activity for this deal
      const lastStageChange = await get(
        `SELECT created_at FROM activities
         WHERE deal_id = ? AND activity_type = 'stage_changed'
         ORDER BY created_at DESC LIMIT 1`,
        [deal.id]
      );

      // If no stage change found, use the deal creation date
      const lastChangeDate = lastStageChange ? lastStageChange.created_at : deal.created_at;
      const daysSinceChange = Math.floor(
        (Date.now() - new Date(lastChangeDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Determine stagnation status
      let stagnationStatus = 'normal'; // green/normal
      if (daysSinceChange >= 20) {
        stagnationStatus = 'critical'; // red
      } else if (daysSinceChange >= 10) {
        stagnationStatus = 'warning'; // yellow
      }

      return {
        ...deal,
        days_in_stage: daysSinceChange,
        stagnation_status: stagnationStatus,
        last_stage_change: lastChangeDate
      };
    }));

    // Group deals by stage
    const stages = ['new_signal', 'qualified', 'discovery', 'solution_design', 'negotiation', 'closed_won', 'closed_lost'];
    const kanbanData = {};

    stages.forEach(stage => {
      kanbanData[stage] = dealsWithStagnation.filter(d => d.stage === stage);
    });

    res.json({
      stages: kanbanData,
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
      company_name,
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
    if (!company_name) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    // Validate text length
    if (company_name.length < 2) {
      return res.status(400).json({ error: 'Company name must be at least 2 characters' });
    }
    if (company_name.length > 255) {
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
        id, company_name, industry, stage, estimated_value, close_date,
        compelling_event_date, next_step_date, next_step_description,
        health_score, owner_id, source, priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dealId,
        company_name,
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
      [uuidv4(), dealId, 'deal_created', `Deal created for ${company_name}`, req.user.id]
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
      company_name,
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

    // Validate required fields
    if (company_name !== undefined && !company_name) {
      return res.status(400).json({ error: 'Company name cannot be empty' });
    }

    // Validate text length
    if (company_name !== undefined && company_name.length < 2) {
      return res.status(400).json({ error: 'Company name must be at least 2 characters' });
    }
    if (company_name !== undefined && company_name.length > 255) {
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

    if (company_name !== undefined) {
      updates.push('company_name = ?');
      params.push(company_name);
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

    res.json({ deal, message: 'Deal updated successfully' });
  } catch (error) {
    console.error('Error updating deal:', error);
    res.status(500).json({ error: 'Failed to update deal' });
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
      `Deal "${existingDeal.company_name}" has been assigned to you by ${req.user.name}`,
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

// POST /api/deals/import/csv - Import deals from CSV
router.post('/import/csv', async (req, res) => {
  try {
    const { csvContent } = req.body;

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
    const headers = headerLine.split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

    // Find column indices
    const companyNameIndex = headers.findIndex(h => h === 'company name' || h === 'company_name' || h === 'companyname');
    const industryIndex = headers.findIndex(h => h === 'industry');
    const stageIndex = headers.findIndex(h => h === 'stage');
    const valueIndex = headers.findIndex(h => h === 'estimated value' || h === 'estimated_value' || h === 'value');
    const closeDateIndex = headers.findIndex(h => h === 'close date' || h === 'close_date');
    const nextStepDateIndex = headers.findIndex(h => h === 'next step date' || h === 'next_step_date');
    const nextStepDescIndex = headers.findIndex(h => h === 'next step description' || h === 'next_step_description');
    const priorityIndex = headers.findIndex(h => h === 'priority');

    if (companyNameIndex === -1) {
      return res.status(400).json({ error: 'CSV must have a "Company Name" column' });
    }

    // Parse CSV values (handle quoted fields)
    const parseCSVLine = (line) => {
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
    };

    const validStages = ['new_signal', 'qualified', 'discovery', 'solution_design', 'negotiation', 'closed_won', 'closed_lost'];
    const validPriorities = ['low', 'medium', 'high'];

    const createdDeals = [];
    const errors = [];

    // Process data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = parseCSVLine(line);
      const companyName = values[companyNameIndex]?.replace(/^"|"$/g, '');

      if (!companyName) {
        errors.push(`Row ${i + 1}: Company name is required`);
        continue;
      }

      const industry = industryIndex >= 0 ? values[industryIndex]?.replace(/^"|"$/g, '') || null : null;
      let stage = stageIndex >= 0 ? values[stageIndex]?.replace(/^"|"$/g, '').toLowerCase().replace(/ /g, '_') || 'new_signal' : 'new_signal';
      const estimatedValue = valueIndex >= 0 ? parseFloat(values[valueIndex]?.replace(/[^0-9.]/g, '')) || null : null;
      const closeDate = closeDateIndex >= 0 ? values[closeDateIndex]?.replace(/^"|"$/g, '') || null : null;
      const nextStepDate = nextStepDateIndex >= 0 ? values[nextStepDateIndex]?.replace(/^"|"$/g, '') || null : null;
      const nextStepDesc = nextStepDescIndex >= 0 ? values[nextStepDescIndex]?.replace(/^"|"$/g, '') || null : null;
      let priority = priorityIndex >= 0 ? values[priorityIndex]?.replace(/^"|"$/g, '').toLowerCase() || 'medium' : 'medium';

      // Validate and normalize stage
      if (!validStages.includes(stage)) {
        stage = 'new_signal';
      }

      // Validate and normalize priority
      if (!validPriorities.includes(priority)) {
        priority = 'medium';
      }

      // Use current date + 30 days for next_step_date if not provided
      const defaultNextStepDate = new Date();
      defaultNextStepDate.setDate(defaultNextStepDate.getDate() + 30);
      const finalNextStepDate = nextStepDate || defaultNextStepDate.toISOString().split('T')[0];

      const dealId = uuidv4();

      try {
        await run(
          `INSERT INTO deals (
            id, company_name, industry, stage, estimated_value, close_date,
            next_step_date, next_step_description, health_score, owner_id, source, priority
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dealId,
            companyName,
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
          [uuidv4(), dealId, 'deal_created', `Deal imported for ${companyName}`, req.user.id]
        );

        createdDeals.push({ id: dealId, company_name: companyName });
      } catch (err) {
        errors.push(`Row ${i + 1}: Failed to create deal for ${companyName} - ${err.message}`);
      }
    }

    res.json({
      success: true,
      imported: createdDeals.length,
      deals: createdDeals,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error importing deals:', error);
    res.status(500).json({ error: 'Failed to import deals' });
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

    // Filter by owner (managers can see all, reps can only see their own)
    if (req.user.role === 'rep' || req.user.role === 'sdr' || req.user.role === 'ae') {
      sql += ' AND d.owner_id = ?';
      params.push(req.user.id);
    } else if (owner) {
      sql += ' AND d.owner_id = ?';
      params.push(owner);
    }

    // Filter by search term
    if (search) {
      sql += ' AND (d.company_name LIKE ? OR d.industry LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY d.created_at DESC';

    const deals = await all(sql, params);

    // Create CSV content
    const headers = [
      'ID',
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

export default router;
