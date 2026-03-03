import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { get, run, all } from '../db/database.js';

const router = express.Router();

// GET /api/deal-lists - Get all lists for the current user
router.get('/', async (req, res) => {
  try {
    const lists = await all(
      `SELECT dl.*,
        (SELECT COUNT(*) FROM deal_list_items dli WHERE dli.deal_list_id = dl.id) as item_count
       FROM deal_lists dl
       WHERE dl.owner_id = ?
       ORDER BY dl.created_at DESC`,
      [req.user.id]
    );

    res.json({ lists });
  } catch (error) {
    console.error('Error fetching deal lists:', error);
    res.status(500).json({ error: 'Failed to fetch deal lists' });
  }
});

// POST /api/deal-lists - Create a new list
router.post('/', async (req, res) => {
  try {
    const { name, description, color } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'List name is required' });
    }

    const id = uuidv4();
    await run(
      `INSERT INTO deal_lists (id, name, description, color, owner_id) VALUES (?, ?, ?, ?, ?)`,
      [id, name.trim(), description || null, color || '#3b82f6', req.user.id]
    );

    const list = await get('SELECT * FROM deal_lists WHERE id = ?', [id]);
    res.status(201).json({ list });
  } catch (error) {
    console.error('Error creating deal list:', error);
    res.status(500).json({ error: 'Failed to create deal list' });
  }
});

// PUT /api/deal-lists/:id - Update a list
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color } = req.body;

    const existing = await get('SELECT * FROM deal_lists WHERE id = ? AND owner_id = ?', [id, req.user.id]);
    if (!existing) {
      return res.status(404).json({ error: 'List not found' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'List name cannot be empty' });
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (color !== undefined) {
      updates.push('color = ?');
      params.push(color);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = datetime("now")');
    params.push(id);

    await run(`UPDATE deal_lists SET ${updates.join(', ')} WHERE id = ?`, params);

    const list = await get('SELECT * FROM deal_lists WHERE id = ?', [id]);
    res.json({ list });
  } catch (error) {
    console.error('Error updating deal list:', error);
    res.status(500).json({ error: 'Failed to update deal list' });
  }
});

// DELETE /api/deal-lists/:id - Delete a list (cascade removes items, not deals)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await get('SELECT * FROM deal_lists WHERE id = ? AND owner_id = ?', [id, req.user.id]);
    if (!existing) {
      return res.status(404).json({ error: 'List not found' });
    }

    await run('DELETE FROM deal_lists WHERE id = ?', [id]);
    res.json({ message: 'List deleted successfully' });
  } catch (error) {
    console.error('Error deleting deal list:', error);
    res.status(500).json({ error: 'Failed to delete deal list' });
  }
});

// POST /api/deal-lists/:id/deals - Add deals to a list
router.post('/:id/deals', async (req, res) => {
  try {
    const { id } = req.params;
    const { dealIds } = req.body;

    if (!dealIds || !Array.isArray(dealIds) || dealIds.length === 0) {
      return res.status(400).json({ error: 'dealIds array is required' });
    }

    const existing = await get('SELECT * FROM deal_lists WHERE id = ? AND owner_id = ?', [id, req.user.id]);
    if (!existing) {
      return res.status(404).json({ error: 'List not found' });
    }

    let added = 0;
    for (const dealId of dealIds) {
      try {
        await run(
          `INSERT INTO deal_list_items (id, deal_list_id, deal_id) VALUES (?, ?, ?)`,
          [uuidv4(), id, dealId]
        );
        added++;
      } catch (err) {
        // Ignore duplicates (unique constraint)
        if (!err.message?.includes('UNIQUE constraint')) {
          console.error(`Error adding deal ${dealId} to list:`, err);
        }
      }
    }

    res.json({ message: `${added} deal(s) added to list`, added });
  } catch (error) {
    console.error('Error adding deals to list:', error);
    res.status(500).json({ error: 'Failed to add deals to list' });
  }
});

// DELETE /api/deal-lists/:id/deals/:dealId - Remove a deal from a list
router.delete('/:id/deals/:dealId', async (req, res) => {
  try {
    const { id, dealId } = req.params;

    const existing = await get('SELECT * FROM deal_lists WHERE id = ? AND owner_id = ?', [id, req.user.id]);
    if (!existing) {
      return res.status(404).json({ error: 'List not found' });
    }

    await run('DELETE FROM deal_list_items WHERE deal_list_id = ? AND deal_id = ?', [id, dealId]);
    res.json({ message: 'Deal removed from list' });
  } catch (error) {
    console.error('Error removing deal from list:', error);
    res.status(500).json({ error: 'Failed to remove deal from list' });
  }
});

// GET /api/deal-lists/for-deal/:dealId - Get lists containing a specific deal
router.get('/for-deal/:dealId', async (req, res) => {
  try {
    const { dealId } = req.params;

    const lists = await all(
      `SELECT dl.* FROM deal_lists dl
       INNER JOIN deal_list_items dli ON dl.id = dli.deal_list_id
       WHERE dli.deal_id = ? AND dl.owner_id = ?`,
      [dealId, req.user.id]
    );

    res.json({ lists });
  } catch (error) {
    console.error('Error fetching lists for deal:', error);
    res.status(500).json({ error: 'Failed to fetch lists for deal' });
  }
});

export default router;
