import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { get, run } from '../db/database.js';

const router = express.Router();

// GET /api/sales-rooms/public/:slug - Public access for clients (NO AUTH REQUIRED)
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { role, password } = req.query;

    console.log('Public sales room request for slug:', slug);

    const salesRoom = await get(
      `SELECT sr.*, d.company_name as deal_company
       FROM sales_rooms sr
       LEFT JOIN deals d ON sr.deal_id = d.id
       WHERE sr.public_url_slug = ?`,
      [slug]
    );

    console.log('Sales room query result:', salesRoom);

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

    // Remove sensitive fields
    delete salesRoom.password_hash;
    delete salesRoom.created_by;

    res.json({ salesRoom });
  } catch (error) {
    console.error('Error fetching public sales room:', error);
    res.status(500).json({ error: 'Failed to fetch sales room' });
  }
});

// POST /api/sales-rooms/public/:slug/track - Track section view from public room (NO AUTH REQUIRED)
router.post('/:slug/track', async (req, res) => {
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
