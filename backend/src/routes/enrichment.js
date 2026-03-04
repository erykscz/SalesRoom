import express from 'express';
import { get } from '../db/database.js';

const router = express.Router();

// GET /api/enrichment/status — Enrichment status (Apify-based)
router.get('/status', (req, res) => {
  const hasApify = !!process.env.APIFY_API_TOKEN;
  res.json({
    configured: hasApify,
    provider: 'apify',
  });
});

// GET /api/enrichment/entity/:entityType/:entityId — Get enrichment results (legacy data)
router.get('/entity/:entityType/:entityId', async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const userId = req.user.id;

    if (!['lead', 'deal'].includes(entityType)) {
      return res.status(400).json({ error: 'entityType must be "lead" or "deal"' });
    }

    const table = entityType === 'deal' ? 'deals' : 'leads';
    const entity = await get(`SELECT * FROM ${table} WHERE id = ?`, [entityId]);
    if (!entity) {
      return res.status(404).json({ error: `${entityType} not found` });
    }
    if (req.user.role !== 'admin' && entity.owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to view this entity' });
    }

    let enrichmentData = null;
    if (entityType === 'lead' && entity.enrichment_data) {
      try { enrichmentData = JSON.parse(entity.enrichment_data); } catch {}
    }

    res.json({
      entityType,
      entityId,
      enrichmentData,
      lastEnriched: entityType === 'deal' ? entity.last_enriched : entity.enriched_at,
      job: null,
    });
  } catch (error) {
    console.error('Error fetching enrichment data:', error);
    res.status(500).json({ error: 'Failed to fetch enrichment data' });
  }
});

export default router;
