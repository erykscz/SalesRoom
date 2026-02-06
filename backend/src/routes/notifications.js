import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { get, run, all } from '../db/database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// GET /api/notifications - Get all notifications for current user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { limit = 50, offset = 0, unreadOnly = 'false' } = req.query;

    let query = `
      SELECT * FROM notifications
      WHERE user_id = ?
    `;
    const params = [req.user.id];

    if (unreadOnly === 'true') {
      query += ' AND is_read = 0';
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const notifications = await all(query, params);

    // Get unread count
    const { count: unreadCount } = await get(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );

    // Get total count
    const { count: total } = await get(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ?',
      [req.user.id]
    );

    res.json({
      notifications: notifications.map(n => ({
        id: n.id,
        type: n.type,
        message: n.message,
        link: n.link,
        isRead: n.is_read === 1,
        createdAt: n.created_at
      })),
      unreadCount,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// PUT /api/notifications/:id/read - Mark notification as read
router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify notification belongs to user
    const notification = await get(
      'SELECT * FROM notifications WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await run('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// PUT /api/notifications/read-all - Mark all notifications as read
router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    await run(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// DELETE /api/notifications/:id - Delete a notification
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify notification belongs to user
    const notification = await get(
      'SELECT * FROM notifications WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await run('DELETE FROM notifications WHERE id = ?', [id]);

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Helper function to create notifications (exported for use in other routes)
export async function createNotification(userId, type, message, link = null) {
  try {
    const id = uuidv4();
    await run(
      'INSERT INTO notifications (id, user_id, type, message, link) VALUES (?, ?, ?, ?, ?)',
      [id, userId, type, message, link]
    );
    return id;
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
}

export default router;
