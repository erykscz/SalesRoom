import express from 'express';
const router = express.Router();

router.get('/', (req, res) => res.status(501).json({ error: 'Not implemented yet' }));
router.post('/upload', (req, res) => res.status(501).json({ error: 'Not implemented yet' }));
router.post('/analyze', (req, res) => res.status(501).json({ error: 'Not implemented yet' }));
router.get('/:id', (req, res) => res.status(501).json({ error: 'Not implemented yet' }));

export default router;
