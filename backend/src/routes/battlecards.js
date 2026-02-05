import express from 'express';
import { get, run, all } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Note: Authentication is applied in index.js before this router

// Valid categories
const VALID_CATEGORIES = ['price', 'technology', 'trust', 'competition', 'timing', 'features'];

// GET /api/battlecards - List all battlecards with optional filters
router.get('/', async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = `
      SELECT b.*, u.name as created_by_name
      FROM battlecards b
      LEFT JOIN users u ON b.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (category && VALID_CATEGORIES.includes(category)) {
      query += ` AND b.category = ?`;
      params.push(category);
    }

    if (search) {
      query += ` AND (b.objection_text LIKE ? OR b.arc_response LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY b.feedback_score DESC, b.created_at DESC`;

    const battlecards = await all(query, params);

    // Parse JSON fields
    const parsedBattlecards = battlecards.map(bc => ({
      ...bc,
      arc_response: bc.arc_response ? JSON.parse(bc.arc_response) : null,
      case_study_links: bc.case_study_links ? JSON.parse(bc.case_study_links) : []
    }));

    res.json({ battlecards: parsedBattlecards });
  } catch (error) {
    console.error('Error fetching battlecards:', error);
    res.status(500).json({ error: 'Failed to fetch battlecards' });
  }
});

// POST /api/battlecards - Create new battlecard
router.post('/', async (req, res) => {
  try {
    const { category, objection_text, arc_response, case_study_links, is_shared } = req.body;

    // Validation
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Valid category is required' });
    }

    if (!objection_text || !objection_text.trim()) {
      return res.status(400).json({ error: 'Objection text is required' });
    }

    if (!arc_response || !arc_response.acknowledge || !arc_response.reframe || !arc_response.counter) {
      return res.status(400).json({ error: 'ARC response (acknowledge, reframe, counter) is required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await run(`
      INSERT INTO battlecards (id, category, objection_text, arc_response, case_study_links, is_shared, created_by, feedback_score, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `, [
      id,
      category,
      objection_text.trim(),
      JSON.stringify(arc_response),
      JSON.stringify(case_study_links || []),
      is_shared ? 1 : 0,
      req.user.id,
      now,
      now
    ]);

    const battlecard = await get(`
      SELECT b.*, u.name as created_by_name
      FROM battlecards b
      LEFT JOIN users u ON b.created_by = u.id
      WHERE b.id = ?
    `, [id]);

    res.status(201).json({
      battlecard: {
        ...battlecard,
        arc_response: JSON.parse(battlecard.arc_response),
        case_study_links: JSON.parse(battlecard.case_study_links || '[]')
      }
    });
  } catch (error) {
    console.error('Error creating battlecard:', error);
    res.status(500).json({ error: 'Failed to create battlecard' });
  }
});

// GET /api/battlecards/:id - Get single battlecard
router.get('/:id', async (req, res) => {
  try {
    const battlecard = await get(`
      SELECT b.*, u.name as created_by_name
      FROM battlecards b
      LEFT JOIN users u ON b.created_by = u.id
      WHERE b.id = ?
    `, [req.params.id]);

    if (!battlecard) {
      return res.status(404).json({ error: 'Battlecard not found' });
    }

    res.json({
      battlecard: {
        ...battlecard,
        arc_response: battlecard.arc_response ? JSON.parse(battlecard.arc_response) : null,
        case_study_links: battlecard.case_study_links ? JSON.parse(battlecard.case_study_links) : []
      }
    });
  } catch (error) {
    console.error('Error fetching battlecard:', error);
    res.status(500).json({ error: 'Failed to fetch battlecard' });
  }
});

// PUT /api/battlecards/:id - Update battlecard
router.put('/:id', async (req, res) => {
  try {
    const battlecard = await get('SELECT * FROM battlecards WHERE id = ?', [req.params.id]);

    if (!battlecard) {
      return res.status(404).json({ error: 'Battlecard not found' });
    }

    // Only creator or admin can edit
    if (battlecard.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only edit your own battlecards' });
    }

    const { objection_text, arc_response, case_study_links, is_shared } = req.body;
    const now = new Date().toISOString();

    await run(`
      UPDATE battlecards
      SET objection_text = COALESCE(?, objection_text),
          arc_response = COALESCE(?, arc_response),
          case_study_links = COALESCE(?, case_study_links),
          is_shared = COALESCE(?, is_shared),
          updated_at = ?
      WHERE id = ?
    `, [
      objection_text ? objection_text.trim() : null,
      arc_response ? JSON.stringify(arc_response) : null,
      case_study_links ? JSON.stringify(case_study_links) : null,
      is_shared !== undefined ? (is_shared ? 1 : 0) : null,
      now,
      req.params.id
    ]);

    const updated = await get(`
      SELECT b.*, u.name as created_by_name
      FROM battlecards b
      LEFT JOIN users u ON b.created_by = u.id
      WHERE b.id = ?
    `, [req.params.id]);

    res.json({
      battlecard: {
        ...updated,
        arc_response: updated.arc_response ? JSON.parse(updated.arc_response) : null,
        case_study_links: updated.case_study_links ? JSON.parse(updated.case_study_links) : []
      }
    });
  } catch (error) {
    console.error('Error updating battlecard:', error);
    res.status(500).json({ error: 'Failed to update battlecard' });
  }
});

// DELETE /api/battlecards/:id - Delete battlecard
router.delete('/:id', async (req, res) => {
  try {
    const battlecard = await get('SELECT * FROM battlecards WHERE id = ?', [req.params.id]);

    if (!battlecard) {
      return res.status(404).json({ error: 'Battlecard not found' });
    }

    // Only creator or admin can delete
    if (battlecard.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own battlecards' });
    }

    await run('DELETE FROM battlecards WHERE id = ?', [req.params.id]);

    res.json({ success: true, message: 'Battlecard deleted' });
  } catch (error) {
    console.error('Error deleting battlecard:', error);
    res.status(500).json({ error: 'Failed to delete battlecard' });
  }
});

// POST /api/battlecards/:id/feedback - Upvote/downvote
router.post('/:id/feedback', async (req, res) => {
  try {
    const { vote } = req.body; // 'up' or 'down'

    if (!['up', 'down'].includes(vote)) {
      return res.status(400).json({ error: 'Vote must be "up" or "down"' });
    }

    const battlecard = await get('SELECT * FROM battlecards WHERE id = ?', [req.params.id]);

    if (!battlecard) {
      return res.status(404).json({ error: 'Battlecard not found' });
    }

    const change = vote === 'up' ? 1 : -1;

    await run(`
      UPDATE battlecards
      SET feedback_score = feedback_score + ?
      WHERE id = ?
    `, [change, req.params.id]);

    const updated = await get('SELECT feedback_score FROM battlecards WHERE id = ?', [req.params.id]);

    res.json({
      success: true,
      feedback_score: updated.feedback_score
    });
  } catch (error) {
    console.error('Error updating feedback:', error);
    res.status(500).json({ error: 'Failed to update feedback' });
  }
});

export default router;
