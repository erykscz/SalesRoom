import express from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { get, run, all } from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = express.Router();

// GET /api/users - List all users (admin only)
router.get('/', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const users = await all(`
      SELECT id, email, name, role, avatar_url, phone, job_title, is_active, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
    `);

    res.json(users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      avatarUrl: u.avatar_url,
      phone: u.phone,
      jobTitle: u.job_title,
      isActive: !!u.is_active,
      createdAt: u.created_at,
      updatedAt: u.updated_at
    })));
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// POST /api/users - Create user (admin only)
router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    // Validate required fields
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character'
      });
    }

    // Check if email already exists
    const existingUser = await get('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    // Validate role
    const validRoles = ['rep', 'sdr', 'ae', 'manager', 'admin'];
    const userRole = role && validRoles.includes(role) ? role : 'rep';

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    const userId = uuidv4();
    await run(
      `INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)`,
      [userId, email.toLowerCase().trim(), passwordHash, name.trim(), userRole]
    );

    // Log the action
    await run(
      'INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), req.user.id, 'user_created', 'user', userId, JSON.stringify({ email, name, role: userRole }), req.ip]
    );

    res.status(201).json({
      id: userId,
      email: email.toLowerCase().trim(),
      name: name.trim(),
      role: userRole,
      isActive: true
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// GET /api/users/:id - Get user by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Users can view their own profile, admins/managers can view anyone
    if (req.user.id !== id && !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const user = await get(
      `SELECT id, email, name, role, avatar_url, phone, job_title, is_active, created_at, updated_at
       FROM users WHERE id = ?`,
      [id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatar_url,
      phone: user.phone,
      jobTitle: user.job_title,
      isActive: !!user.is_active,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, isActive, avatarUrl, phone, jobTitle } = req.body;

    // Users can update their own profile (except role), admins can update anyone
    const isOwnProfile = req.user.id === id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwnProfile && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Fetch existing user
    const existingUser = await get('SELECT * FROM users WHERE id = ?', [id]);
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Build update query
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }

    if (email !== undefined) {
      // Check if email is taken by another user
      const emailUser = await get('SELECT id FROM users WHERE email = ? AND id != ?', [email.toLowerCase().trim(), id]);
      if (emailUser) {
        return res.status(400).json({ error: 'Email already in use' });
      }
      updates.push('email = ?');
      params.push(email.toLowerCase().trim());
    }

    // Only admins can change roles
    if (role !== undefined && isAdmin) {
      const validRoles = ['rep', 'sdr', 'ae', 'manager', 'admin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      updates.push('role = ?');
      params.push(role);
    }

    // Only admins can activate/deactivate users
    if (isActive !== undefined && isAdmin) {
      updates.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }

    if (avatarUrl !== undefined) {
      updates.push('avatar_url = ?');
      params.push(avatarUrl);
    }

    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone || null);
    }

    if (jobTitle !== undefined) {
      updates.push('job_title = ?');
      params.push(jobTitle || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = datetime("now")');
    params.push(id);

    await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    // Log the action
    await run(
      'INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), req.user.id, 'user_updated', 'user', id, JSON.stringify({ updates: Object.keys(req.body) }), req.ip]
    );

    // Fetch updated user
    const updatedUser = await get(
      `SELECT id, email, name, role, avatar_url, phone, job_title, is_active, created_at, updated_at FROM users WHERE id = ?`,
      [id]
    );

    res.json({
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedUser.role,
      avatarUrl: updatedUser.avatar_url,
      phone: updatedUser.phone,
      jobTitle: updatedUser.job_title,
      isActive: !!updatedUser.is_active,
      createdAt: updatedUser.created_at,
      updatedAt: updatedUser.updated_at
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/users/:id - Delete user (admin only, soft delete)
router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (req.user.id === id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = await get('SELECT id, email, name FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Soft delete - deactivate the user
    await run('UPDATE users SET is_active = 0, updated_at = datetime("now") WHERE id = ?', [id]);

    // Log the action
    await run(
      'INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), req.user.id, 'user_deactivated', 'user', id, JSON.stringify({ email: user.email }), req.ip]
    );

    res.json({ message: 'User deactivated successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
