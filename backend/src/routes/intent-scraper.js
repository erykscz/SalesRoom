import express from 'express';
const router = express.Router();

router.get('/searches', (req, res) => res.status(501).json({ error: 'Not implemented yet' }));
router.post('/search', (req, res) => res.status(501).json({ error: 'Not implemented yet' }));
router.get('/searches/:id', (req, res) => res.status(501).json({ error: 'Not implemented yet' }));

export default router;
