import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';

const router = express.Router();

// GET /api/leads - List all leads with filters
router.get('/', (req, res) => {
  try {
    const { status, search, sort_by = 'created_at', sort_order = 'desc' } = req.query;
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

    // Search by company name or industry
    if (search) {
      query += ` AND (l.company_name LIKE ? OR l.industry LIKE ? OR l.identified_pain LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Sorting
    const validSortFields = ['created_at', 'company_name', 'confidence_score', 'status'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
    const order = sort_order === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY l.${sortField} ${order}`;

    db.all(query, params, (err, leads) => {
      if (err) {
        console.error('Error fetching leads:', err);
        return res.status(500).json({ error: 'Failed to fetch leads' });
      }

      // Parse JSON fields
      const parsedLeads = leads.map(lead => ({
        ...lead,
        tech_stack: lead.tech_stack ? JSON.parse(lead.tech_stack) : [],
        hook_suggestions: lead.hook_suggestions ? JSON.parse(lead.hook_suggestions) : [],
        competitor_info: lead.competitor_info ? JSON.parse(lead.competitor_info) : null,
        trigger_events: lead.trigger_events ? JSON.parse(lead.trigger_events) : []
      }));

      res.json(parsedLeads);
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// POST /api/leads - Create a new lead
router.post('/', (req, res) => {
  try {
    const {
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
    if (!company_name || company_name.trim().length === 0) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    const id = uuidv4();
    const owner_id = req.user.id;
    const now = new Date().toISOString();

    db.run(`
      INSERT INTO leads (
        id, company_name, industry, tech_stack, identified_pain,
        confidence_score, source_link, status, owner_id, notes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      company_name.trim(),
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
    ], function(err) {
      if (err) {
        console.error('Error creating lead:', err);
        return res.status(500).json({ error: 'Failed to create lead' });
      }

      db.get('SELECT * FROM leads WHERE id = ?', [id], (err, lead) => {
        if (err) {
          console.error('Error fetching created lead:', err);
          return res.status(500).json({ error: 'Lead created but failed to fetch' });
        }

        res.status(201).json({
          ...lead,
          tech_stack: lead.tech_stack ? JSON.parse(lead.tech_stack) : []
        });
      });
    });
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

// GET /api/leads/:id - Get a single lead
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    db.get(`
      SELECT l.*, u.name as owner_name
      FROM leads l
      LEFT JOIN users u ON l.owner_id = u.id
      WHERE l.id = ?
    `, [id], (err, lead) => {
      if (err) {
        console.error('Error fetching lead:', err);
        return res.status(500).json({ error: 'Failed to fetch lead' });
      }

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
    });
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ error: 'Failed to fetch lead' });
  }
});

// PUT /api/leads/:id - Update a lead
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    db.get('SELECT * FROM leads WHERE id = ?', [id], (err, lead) => {
      if (err) {
        console.error('Error fetching lead:', err);
        return res.status(500).json({ error: 'Failed to fetch lead' });
      }

      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      // Check ownership unless admin
      if (userRole !== 'admin' && lead.owner_id !== userId) {
        return res.status(403).json({ error: 'Not authorized to edit this lead' });
      }

      const {
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
      if (company_name !== undefined && company_name.trim().length === 0) {
        return res.status(400).json({ error: 'Company name cannot be empty' });
      }

      const now = new Date().toISOString();

      db.run(`
        UPDATE leads SET
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
      ], function(err) {
        if (err) {
          console.error('Error updating lead:', err);
          return res.status(500).json({ error: 'Failed to update lead' });
        }

        db.get('SELECT * FROM leads WHERE id = ?', [id], (err, updatedLead) => {
          if (err) {
            console.error('Error fetching updated lead:', err);
            return res.status(500).json({ error: 'Lead updated but failed to fetch' });
          }

          res.json({
            ...updatedLead,
            tech_stack: updatedLead.tech_stack ? JSON.parse(updatedLead.tech_stack) : []
          });
        });
      });
    });
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// DELETE /api/leads/:id - Delete a lead
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    db.get('SELECT * FROM leads WHERE id = ?', [id], (err, lead) => {
      if (err) {
        console.error('Error fetching lead:', err);
        return res.status(500).json({ error: 'Failed to fetch lead' });
      }

      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      // Check ownership unless admin
      if (userRole !== 'admin' && lead.owner_id !== userId) {
        return res.status(403).json({ error: 'Not authorized to delete this lead' });
      }

      db.run('DELETE FROM leads WHERE id = ?', [id], function(err) {
        if (err) {
          console.error('Error deleting lead:', err);
          return res.status(500).json({ error: 'Failed to delete lead' });
        }

        res.json({ message: 'Lead deleted successfully' });
      });
    });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

// POST /api/leads/:id/convert-to-deal - Convert lead to deal
router.post('/:id/convert-to-deal', (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    db.get('SELECT * FROM leads WHERE id = ?', [id], (err, lead) => {
      if (err) {
        console.error('Error fetching lead:', err);
        return res.status(500).json({ error: 'Failed to fetch lead' });
      }

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

      // Create the deal
      db.run(`
        INSERT INTO deals (
          id, company_name, industry, stage, estimated_value,
          next_step_date, next_step_description, health_score, owner_id,
          source, priority, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        dealId,
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
      ], function(err) {
        if (err) {
          console.error('Error creating deal:', err);
          return res.status(500).json({ error: 'Failed to create deal' });
        }

        // Update lead with deal_id and status
        db.run(`
          UPDATE leads SET deal_id = ?, status = 'qualified', updated_at = ?
          WHERE id = ?
        `, [dealId, now, id], function(err) {
          if (err) {
            console.error('Error updating lead:', err);
            return res.status(500).json({ error: 'Deal created but failed to update lead' });
          }

          // Create activity for the deal
          db.run(`
            INSERT INTO activities (id, deal_id, activity_type, description, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [activityId, dealId, 'deal_created', `Deal created from Intent Scraper lead: ${lead.company_name}`, userId, now], function(err) {
            if (err) {
              console.error('Error creating activity:', err);
              // Don't fail the whole operation for this
            }

            db.get('SELECT * FROM deals WHERE id = ?', [dealId], (err, deal) => {
              if (err) {
                console.error('Error fetching deal:', err);
                return res.status(500).json({ error: 'Deal created but failed to fetch' });
              }

              res.status(201).json({
                message: 'Lead converted to deal successfully',
                deal
              });
            });
          });
        });
      });
    });
  } catch (error) {
    console.error('Error converting lead to deal:', error);
    res.status(500).json({ error: 'Failed to convert lead to deal' });
  }
});

export default router;
