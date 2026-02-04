import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { get, run, all } from '../db/database.js';

const router = express.Router();

// GET /api/deals - List all deals
router.get('/', async (req, res) => {
  try {
    const { stage, owner, health_score_min, health_score_max, search, archived } = req.query;

    let sql = `
      SELECT d.*, u.name as owner_name, u.email as owner_email
      FROM deals d
      LEFT JOIN users u ON d.owner_id = u.id
      WHERE 1=1
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

    // Filter by health score range
    if (health_score_min) {
      sql += ' AND d.health_score >= ?';
      params.push(parseInt(health_score_min));
    }
    if (health_score_max) {
      sql += ' AND d.health_score <= ?';
      params.push(parseInt(health_score_max));
    }

    // Filter by search term
    if (search) {
      sql += ' AND (d.company_name LIKE ? OR d.industry LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Filter archived
    if (archived === 'true') {
      sql += ' AND d.is_archived = 1';
    } else {
      sql += ' AND d.is_archived = 0';
    }

    sql += ' ORDER BY d.created_at DESC';

    const deals = await all(sql, params);

    res.json({ deals });
  } catch (error) {
    console.error('Error fetching deals:', error);
    res.status(500).json({ error: 'Failed to fetch deals' });
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
      health_score
    } = req.body;

    // Validate required fields
    if (company_name !== undefined && !company_name) {
      return res.status(400).json({ error: 'Company name cannot be empty' });
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

export default router;
