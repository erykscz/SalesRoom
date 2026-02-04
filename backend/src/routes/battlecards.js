import express from 'express';
const router = express.Router();

router.get('/', (req, res) => res.status(501).json({ error: 'Not implemented yet' }));
router.post('/', (req, res) => res.status(501).json({ error: 'Not implemented yet' }));
router.get('/:id', (req, res) => res.status(501).json({ error: 'Not implemented yet' }));
router.put('/:id', (req, res) => res.status(501).json({ error: 'Not implemented yet' }));
router.delete('/:id', (req, res) => res.status(501).json({ error: 'Not implemented yet' }));

export default router;
