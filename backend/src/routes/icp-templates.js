import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';

const router = express.Router();

// GET /api/icp-templates - List all ICP templates
router.get('/', (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;
  const { search } = req.query;

  let sql = `
    SELECT t.*, u.name as owner_name
    FROM icp_templates t
    LEFT JOIN users u ON t.owner_id = u.id
    WHERE (t.owner_id = ? OR t.is_shared = 1 OR ? IN ('admin', 'manager'))
  `;
  const params = [userId, userRole];

  if (search) {
    sql += ' AND (t.name LIKE ? OR t.description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY t.created_at DESC';

  db.all(sql, params, (err, templates) => {
    if (err) {
      console.error('Error fetching ICP templates:', err);
      return res.status(500).json({ error: 'Failed to fetch ICP templates' });
    }

    // Parse criteria JSON for each template
    const parsedTemplates = templates.map(t => ({
      ...t,
      criteria: t.criteria ? JSON.parse(t.criteria) : {},
      is_shared: Boolean(t.is_shared)
    }));

    res.json({ templates: parsedTemplates });
  });
});

// GET /api/icp-templates/:id - Get single ICP template
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  const sql = `
    SELECT t.*, u.name as owner_name
    FROM icp_templates t
    LEFT JOIN users u ON t.owner_id = u.id
    WHERE t.id = ? AND (t.owner_id = ? OR t.is_shared = 1 OR ? IN ('admin', 'manager'))
  `;

  db.get(sql, [id, userId, userRole], (err, template) => {
    if (err) {
      console.error('Error fetching ICP template:', err);
      return res.status(500).json({ error: 'Failed to fetch ICP template' });
    }

    if (!template) {
      return res.status(404).json({ error: 'ICP template not found' });
    }

    res.json({
      ...template,
      criteria: template.criteria ? JSON.parse(template.criteria) : {},
      is_shared: Boolean(template.is_shared)
    });
  });
});

// POST /api/icp-templates - Create new ICP template
router.post('/', (req, res) => {
  const { name, description, criteria, is_shared } = req.body;
  const userId = req.user.id;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Template name is required' });
  }

  if (!criteria || typeof criteria !== 'object') {
    return res.status(400).json({ error: 'Criteria is required and must be an object' });
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  const sql = `
    INSERT INTO icp_templates (id, name, description, criteria, is_shared, owner_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [
    id,
    name.trim(),
    description || null,
    JSON.stringify(criteria),
    is_shared ? 1 : 0,
    userId,
    now,
    now
  ], function(err) {
    if (err) {
      console.error('Error creating ICP template:', err);
      return res.status(500).json({ error: 'Failed to create ICP template' });
    }

    res.status(201).json({
      id,
      name: name.trim(),
      description,
      criteria,
      is_shared: Boolean(is_shared),
      owner_id: userId,
      created_at: now,
      updated_at: now
    });
  });
});

// PUT /api/icp-templates/:id - Update ICP template
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, description, criteria, is_shared } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  // First check if template exists and user has permission
  db.get('SELECT * FROM icp_templates WHERE id = ?', [id], (err, template) => {
    if (err) {
      console.error('Error fetching ICP template:', err);
      return res.status(500).json({ error: 'Failed to fetch ICP template' });
    }

    if (!template) {
      return res.status(404).json({ error: 'ICP template not found' });
    }

    // Only owner or admin can edit
    if (template.owner_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: 'You can only edit your own templates' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    const now = new Date().toISOString();

    const updateSql = `
      UPDATE icp_templates
      SET name = ?, description = ?, criteria = ?, is_shared = ?, updated_at = ?
      WHERE id = ?
    `;

    db.run(updateSql, [
      name.trim(),
      description || null,
      criteria ? JSON.stringify(criteria) : template.criteria,
      is_shared !== undefined ? (is_shared ? 1 : 0) : template.is_shared,
      now,
      id
    ], function(err) {
      if (err) {
        console.error('Error updating ICP template:', err);
        return res.status(500).json({ error: 'Failed to update ICP template' });
      }

      res.json({
        id,
        name: name.trim(),
        description,
        criteria: criteria || JSON.parse(template.criteria),
        is_shared: is_shared !== undefined ? Boolean(is_shared) : Boolean(template.is_shared),
        owner_id: template.owner_id,
        updated_at: now
      });
    });
  });
});

// DELETE /api/icp-templates/:id - Delete ICP template
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  // First check if template exists and user has permission
  db.get('SELECT * FROM icp_templates WHERE id = ?', [id], (err, template) => {
    if (err) {
      console.error('Error fetching ICP template:', err);
      return res.status(500).json({ error: 'Failed to fetch ICP template' });
    }

    if (!template) {
      return res.status(404).json({ error: 'ICP template not found' });
    }

    // Only owner or admin can delete
    if (template.owner_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own templates' });
    }

    db.run('DELETE FROM icp_templates WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('Error deleting ICP template:', err);
        return res.status(500).json({ error: 'Failed to delete ICP template' });
      }

      res.json({ message: 'ICP template deleted successfully' });
    });
  });
});

export default router;
