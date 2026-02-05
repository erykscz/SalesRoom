import express from 'express';
import db from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// GET /api/knowledge - List all knowledge base items (with search)
router.get('/', async (req, res) => {
  try {
    const { search, type } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    let sql = `
      SELECT kb.*, u.name as created_by_name
      FROM knowledge_base kb
      LEFT JOIN users u ON kb.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    // Filter by type if specified
    if (type) {
      sql += ` AND kb.type = ?`;
      params.push(type);
    }

    // Search in title and content
    if (search && search.trim()) {
      sql += ` AND (kb.title LIKE ? OR kb.content LIKE ? OR kb.tags LIKE ?)`;
      const searchTerm = `%${search.trim()}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Show shared items or user's own items
    sql += ` AND (kb.is_shared = 1 OR kb.created_by = ?)`;
    params.push(userId);

    sql += ` ORDER BY kb.created_at DESC`;

    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('Error fetching knowledge base:', err);
        return res.status(500).json({ error: 'Failed to fetch knowledge base items' });
      }

      // Parse tags JSON for each row
      const items = rows.map(row => ({
        ...row,
        tags: row.tags ? JSON.parse(row.tags) : []
      }));

      res.json({ items, count: items.length });
    });
  } catch (error) {
    console.error('Error in knowledge GET:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/knowledge - Create new knowledge base item
router.post('/', async (req, res) => {
  try {
    const { type, title, content, tags } = req.body;
    const userId = req.user.id;

    // Validation
    if (!type) {
      return res.status(400).json({ error: 'Type is required' });
    }
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const validTypes = ['case_study', 'faq', 'competitor_sheet', 'offer_template'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be one of: ' + validTypes.join(', ') });
    }

    const id = uuidv4();
    const tagsJson = tags && Array.isArray(tags) ? JSON.stringify(tags) : JSON.stringify([]);

    const sql = `
      INSERT INTO knowledge_base (id, type, title, content, tags, is_shared, created_by)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `;

    db.run(sql, [id, type, title.trim(), content || '', tagsJson, userId], function(err) {
      if (err) {
        console.error('Error creating knowledge base item:', err);
        return res.status(500).json({ error: 'Failed to create knowledge base item' });
      }

      // Fetch the created item
      db.get(
        `SELECT kb.*, u.name as created_by_name FROM knowledge_base kb LEFT JOIN users u ON kb.created_by = u.id WHERE kb.id = ?`,
        [id],
        (err, row) => {
          if (err) {
            console.error('Error fetching created item:', err);
            return res.status(500).json({ error: 'Item created but failed to fetch' });
          }

          res.status(201).json({
            item: {
              ...row,
              tags: row.tags ? JSON.parse(row.tags) : []
            }
          });
        }
      );
    });
  } catch (error) {
    console.error('Error in knowledge POST:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/knowledge/search - Search knowledge base
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    const userId = req.user.id;

    if (!q || !q.trim()) {
      return res.json({ items: [], count: 0 });
    }

    const searchTerm = `%${q.trim()}%`;

    const sql = `
      SELECT kb.*, u.name as created_by_name
      FROM knowledge_base kb
      LEFT JOIN users u ON kb.created_by = u.id
      WHERE (kb.title LIKE ? OR kb.content LIKE ? OR kb.tags LIKE ?)
        AND (kb.is_shared = 1 OR kb.created_by = ?)
      ORDER BY
        CASE
          WHEN kb.title LIKE ? THEN 1
          WHEN kb.content LIKE ? THEN 2
          ELSE 3
        END,
        kb.created_at DESC
    `;

    db.all(sql, [searchTerm, searchTerm, searchTerm, userId, searchTerm, searchTerm], (err, rows) => {
      if (err) {
        console.error('Error searching knowledge base:', err);
        return res.status(500).json({ error: 'Failed to search knowledge base' });
      }

      const items = rows.map(row => ({
        ...row,
        tags: row.tags ? JSON.parse(row.tags) : []
      }));

      res.json({ items, count: items.length });
    });
  } catch (error) {
    console.error('Error in knowledge search:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/knowledge/:id - Get single item
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    db.get(
      `SELECT kb.*, u.name as created_by_name
       FROM knowledge_base kb
       LEFT JOIN users u ON kb.created_by = u.id
       WHERE kb.id = ? AND (kb.is_shared = 1 OR kb.created_by = ?)`,
      [id, userId],
      (err, row) => {
        if (err) {
          console.error('Error fetching knowledge base item:', err);
          return res.status(500).json({ error: 'Failed to fetch item' });
        }

        if (!row) {
          return res.status(404).json({ error: 'Item not found' });
        }

        res.json({
          item: {
            ...row,
            tags: row.tags ? JSON.parse(row.tags) : []
          }
        });
      }
    );
  } catch (error) {
    console.error('Error in knowledge GET/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/knowledge/:id - Update item
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, tags, is_shared } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Check if item exists and user can edit
    db.get('SELECT * FROM knowledge_base WHERE id = ?', [id], (err, item) => {
      if (err) {
        console.error('Error checking item:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }

      // Only creator or admin can edit
      if (item.created_by !== userId && userRole !== 'admin') {
        return res.status(403).json({ error: 'You can only edit your own items' });
      }

      const updates = [];
      const params = [];

      if (title !== undefined) {
        if (!title.trim()) {
          return res.status(400).json({ error: 'Title cannot be empty' });
        }
        updates.push('title = ?');
        params.push(title.trim());
      }

      if (content !== undefined) {
        updates.push('content = ?');
        params.push(content);
      }

      if (tags !== undefined) {
        updates.push('tags = ?');
        params.push(JSON.stringify(tags || []));
      }

      if (is_shared !== undefined) {
        updates.push('is_shared = ?');
        params.push(is_shared ? 1 : 0);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push("updated_at = datetime('now')");
      params.push(id);

      const sql = `UPDATE knowledge_base SET ${updates.join(', ')} WHERE id = ?`;

      db.run(sql, params, function(err) {
        if (err) {
          console.error('Error updating item:', err);
          return res.status(500).json({ error: 'Failed to update item' });
        }

        // Fetch updated item
        db.get(
          `SELECT kb.*, u.name as created_by_name FROM knowledge_base kb LEFT JOIN users u ON kb.created_by = u.id WHERE kb.id = ?`,
          [id],
          (err, row) => {
            if (err) {
              return res.status(500).json({ error: 'Update successful but failed to fetch' });
            }

            res.json({
              item: {
                ...row,
                tags: row.tags ? JSON.parse(row.tags) : []
              }
            });
          }
        );
      });
    });
  } catch (error) {
    console.error('Error in knowledge PUT:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/knowledge/:id - Delete item
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Check if item exists and user can delete
    db.get('SELECT * FROM knowledge_base WHERE id = ?', [id], (err, item) => {
      if (err) {
        console.error('Error checking item:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }

      // Only creator or admin can delete
      if (item.created_by !== userId && userRole !== 'admin') {
        return res.status(403).json({ error: 'You can only delete your own items' });
      }

      db.run('DELETE FROM knowledge_base WHERE id = ?', [id], function(err) {
        if (err) {
          console.error('Error deleting item:', err);
          return res.status(500).json({ error: 'Failed to delete item' });
        }

        res.json({ message: 'Item deleted successfully' });
      });
    });
  } catch (error) {
    console.error('Error in knowledge DELETE:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
