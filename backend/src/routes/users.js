import express from 'express';
const router = express.Router();

// GET /api/users - List all users (admin only)
router.get('/', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// POST /api/users - Create user (admin only)
router.post('/', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// GET /api/users/:id - Get user by ID
router.get('/:id', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// PUT /api/users/:id - Update user
router.put('/:id', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// DELETE /api/users/:id - Delete user (admin only)
router.delete('/:id', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

export default router;
