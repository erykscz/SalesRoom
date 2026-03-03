// Enrichment pipeline orchestrator
// Note: On Vercel serverless, enrichment runs synchronously within the request
// (no fire-and-forget — the function would be killed after response).

import { v4 as uuidv4 } from 'uuid';
import { run, get } from '../../db/database.js';
import { researchLinkedInPerson } from './linkedin.js';
import { researchWebsite } from './website.js';

export async function enrichEntity(jobId, entityType, entityId, userId) {
  try {
    // Update job status to running
    await run(
      `UPDATE enrichment_jobs SET status = 'running', updated_at = datetime('now') WHERE id = ?`,
      [jobId]
    );

    // Fetch entity data
    let entity;
    if (entityType === 'deal') {
      entity = await get('SELECT * FROM deals WHERE id = ?', [entityId]);
    } else if (entityType === 'lead') {
      entity = await get('SELECT * FROM leads WHERE id = ?', [entityId]);
    }

    if (!entity) {
      await run(
        `UPDATE enrichment_jobs SET status = 'failed', error_log = ?, updated_at = datetime('now') WHERE id = ?`,
        [JSON.stringify({ error: `${entityType} not found` }), jobId]
      );
      return { status: 'failed', error: `${entityType} not found` };
    }

    const errors = [];
    let linkedinData = null;
    let websiteData = null;

    // Run LinkedIn + website research in parallel to fit within Vercel timeout
    const linkedinUrl = entity.linkedin_url || null;
    const companyUrl = entity.company_url || entity.company_website || null;

    const tasks = [];

    if (linkedinUrl) {
      tasks.push(
        researchLinkedInPerson(linkedinUrl)
          .then(r => { if (r.success) linkedinData = r.data; else errors.push({ source: 'linkedin', error: r.error }); })
          .catch(err => errors.push({ source: 'linkedin', error: err.message }))
      );
    }

    if (companyUrl) {
      tasks.push(
        researchWebsite(companyUrl)
          .then(r => { if (r.success) websiteData = r.data; else errors.push({ source: 'website', error: r.error }); })
          .catch(err => errors.push({ source: 'website', error: err.message }))
      );
    }

    await Promise.all(tasks);

    // Determine final status
    const hasData = linkedinData || websiteData;
    const allFailed = !linkedinData && !websiteData && (linkedinUrl || companyUrl);
    const status = allFailed ? 'failed' : hasData ? (errors.length > 0 ? 'partial' : 'completed') : 'completed';

    // Store results in enrichment_jobs table
    await run(
      `UPDATE enrichment_jobs SET
        status = ?,
        linkedin_data = ?,
        website_data = ?,
        error_log = ?,
        updated_at = datetime('now'),
        completed_at = datetime('now')
      WHERE id = ?`,
      [
        status,
        linkedinData ? JSON.stringify(linkedinData) : null,
        websiteData ? JSON.stringify(websiteData) : null,
        errors.length > 0 ? JSON.stringify(errors) : null,
        jobId,
      ]
    );

    // Store results on the entity itself
    const enrichmentPayload = JSON.stringify({
      linkedin: linkedinData,
      website: websiteData,
      enriched_at: new Date().toISOString(),
      provider: 'tinyfish',
    });

    if (entityType === 'deal') {
      await run(
        `UPDATE deals SET tinyfish_research = ?, last_enriched = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
        [enrichmentPayload, entityId]
      );
    } else if (entityType === 'lead') {
      await run(
        `UPDATE leads SET enrichment_data = ?, enriched_at = datetime('now'), enrichment_status = ?, updated_at = datetime('now') WHERE id = ?`,
        [enrichmentPayload, status, entityId]
      );
    }

    console.log(`Enrichment ${jobId} completed with status: ${status}`);
    return { status, linkedinData, websiteData, errors };
  } catch (err) {
    console.error(`Enrichment ${jobId} failed:`, err);
    await run(
      `UPDATE enrichment_jobs SET status = 'failed', error_log = ?, updated_at = datetime('now') WHERE id = ?`,
      [JSON.stringify({ error: err.message }), jobId]
    ).catch(() => {});
    return { status: 'failed', error: err.message };
  }
}

export async function enrichBulk(jobs, userId) {
  const results = [];

  for (const job of jobs) {
    const jobId = uuidv4();

    await run(
      `INSERT INTO enrichment_jobs (id, entity_type, entity_id, status, provider, requested_by)
       VALUES (?, ?, ?, 'pending', 'tinyfish', ?)`,
      [jobId, job.entityType, job.entityId, userId]
    );

    // Run enrichment synchronously (Vercel kills after response)
    const result = await enrichEntity(jobId, job.entityType, job.entityId, userId);
    results.push({ jobId, entityType: job.entityType, entityId: job.entityId, status: result.status });
  }

  return results;
}
