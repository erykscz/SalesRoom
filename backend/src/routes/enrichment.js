import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { run, get, all } from '../db/database.js';
import { isConfigured } from '../services/tinyfish/client.js';
import { enrichEntity, enrichBulk } from '../services/tinyfish/enrichment.js';

const router = express.Router();

// GET /api/enrichment/status — Check if TinyFish is configured
router.get('/status', (req, res) => {
  res.json({
    configured: isConfigured(),
    provider: process.env.RESEARCH_PROVIDER || 'proxycurl',
  });
});

// POST /api/enrichment/enrich — Enrich single lead or deal (async, returns jobId)
router.post('/enrich', async (req, res) => {
  try {
    const { entityType, entityId } = req.body;
    const userId = req.user.id;

    if (!entityType || !entityId) {
      return res.status(400).json({ error: 'entityType and entityId are required' });
    }

    if (!['lead', 'deal'].includes(entityType)) {
      return res.status(400).json({ error: 'entityType must be "lead" or "deal"' });
    }

    if (!isConfigured()) {
      return res.status(400).json({ error: 'TinyFish API is not configured. Set TINYFISH_API_KEY in environment.' });
    }

    // Row-level security: non-admin users can only enrich their own entities
    const table = entityType === 'deal' ? 'deals' : 'leads';
    const entity = await get(`SELECT id, owner_id FROM ${table} WHERE id = ?`, [entityId]);
    if (!entity) {
      return res.status(404).json({ error: `${entityType} not found` });
    }
    if (req.user.role !== 'admin' && entity.owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to enrich this entity' });
    }

    const jobId = uuidv4();
    await run(
      `INSERT INTO enrichment_jobs (id, entity_type, entity_id, status, provider, requested_by)
       VALUES (?, ?, ?, 'pending', 'tinyfish', ?)`,
      [jobId, entityType, entityId, userId]
    );

    // Fire-and-forget enrichment
    enrichEntity(jobId, entityType, entityId, userId);

    res.status(202).json({
      jobId,
      status: 'pending',
      message: 'Enrichment started. Poll /api/enrichment/jobs/:jobId/status for progress.',
    });
  } catch (error) {
    console.error('Error starting enrichment:', error);
    res.status(500).json({ error: 'Failed to start enrichment', details: error.message || String(error) });
  }
});

// POST /api/enrichment/bulk — Bulk enrich multiple entities (max 50)
router.post('/bulk', async (req, res) => {
  try {
    const { jobs } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({ error: 'jobs array is required and must not be empty' });
    }

    if (jobs.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 entities per bulk request' });
    }

    if (!isConfigured()) {
      return res.status(400).json({ error: 'TinyFish API is not configured. Set TINYFISH_API_KEY in environment.' });
    }

    // Validate all jobs
    for (const job of jobs) {
      if (!job.entityType || !job.entityId) {
        return res.status(400).json({ error: 'Each job must have entityType and entityId' });
      }
      if (!['lead', 'deal'].includes(job.entityType)) {
        return res.status(400).json({ error: 'entityType must be "lead" or "deal"' });
      }
    }

    // Row-level security check for non-admin users
    if (req.user.role !== 'admin') {
      for (const job of jobs) {
        const table = job.entityType === 'deal' ? 'deals' : 'leads';
        const entity = await get(`SELECT id, owner_id FROM ${table} WHERE id = ?`, [job.entityId]);
        if (!entity || entity.owner_id !== userId) {
          return res.status(403).json({ error: `Not authorized to enrich ${job.entityType} ${job.entityId}` });
        }
      }
    }

    const results = await enrichBulk(jobs, userId);

    res.status(202).json({
      jobs: results,
      message: `${results.length} enrichment jobs started.`,
    });
  } catch (error) {
    console.error('Error starting bulk enrichment:', error);
    res.status(500).json({ error: 'Failed to start bulk enrichment' });
  }
});

// GET /api/enrichment/jobs/:jobId/status — Poll job status
router.get('/jobs/:jobId/status', async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await get(
      'SELECT id, entity_type, entity_id, status, error_log, created_at, updated_at, completed_at FROM enrichment_jobs WHERE id = ?',
      [jobId]
    );

    if (!job) {
      return res.status(404).json({ error: 'Enrichment job not found' });
    }

    res.json({
      id: job.id,
      entityType: job.entity_type,
      entityId: job.entity_id,
      status: job.status,
      errors: job.error_log ? JSON.parse(job.error_log) : null,
      created_at: job.created_at,
      updated_at: job.updated_at,
      completed_at: job.completed_at,
    });
  } catch (error) {
    console.error('Error fetching enrichment job status:', error);
    res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

// GET /api/enrichment/entity/:entityType/:entityId — Get enrichment results for entity
router.get('/entity/:entityType/:entityId', async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const userId = req.user.id;

    if (!['lead', 'deal'].includes(entityType)) {
      return res.status(400).json({ error: 'entityType must be "lead" or "deal"' });
    }

    // Row-level security
    const table = entityType === 'deal' ? 'deals' : 'leads';
    const entity = await get(`SELECT * FROM ${table} WHERE id = ?`, [entityId]);
    if (!entity) {
      return res.status(404).json({ error: `${entityType} not found` });
    }
    if (req.user.role !== 'admin' && entity.owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to view this entity' });
    }

    // Get the latest enrichment job for this entity
    const job = await get(
      `SELECT * FROM enrichment_jobs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 1`,
      [entityType, entityId]
    );

    // Get enrichment data from entity
    let enrichmentData = null;
    if (entityType === 'deal' && entity.tinyfish_research) {
      try { enrichmentData = JSON.parse(entity.tinyfish_research); } catch { /* ignore */ }
    } else if (entityType === 'lead' && entity.enrichment_data) {
      try { enrichmentData = JSON.parse(entity.enrichment_data); } catch { /* ignore */ }
    }

    res.json({
      entityType,
      entityId,
      enrichmentData,
      lastEnriched: entityType === 'deal' ? entity.last_enriched : entity.enriched_at,
      job: job ? {
        id: job.id,
        status: job.status,
        linkedinData: job.linkedin_data ? JSON.parse(job.linkedin_data) : null,
        websiteData: job.website_data ? JSON.parse(job.website_data) : null,
        errors: job.error_log ? JSON.parse(job.error_log) : null,
        created_at: job.created_at,
        completed_at: job.completed_at,
      } : null,
    });
  } catch (error) {
    console.error('Error fetching enrichment data:', error);
    res.status(500).json({ error: 'Failed to fetch enrichment data' });
  }
});

export default router;
