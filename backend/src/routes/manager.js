import express from 'express';
const router = express.Router();

router.get('/dashboard', (req, res) => res.status(501).json({ error: 'Not implemented yet' }));
router.get('/team-pipeline', (req, res) => res.status(501).json({ error: 'Not implemented yet' }));
router.get('/rep-performance', (req, res) => res.status(501).json({ error: 'Not implemented yet' }));
router.get('/forecast', (req, res) => res.status(501).json({ error: 'Not implemented yet' }));

export default router;
