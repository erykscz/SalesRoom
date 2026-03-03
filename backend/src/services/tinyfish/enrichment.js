// Enrichment pipeline orchestrator

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
      return;
    }

    const errors = [];
    let linkedinData = null;
    let websiteData = null;

    // LinkedIn person research
    const linkedinUrl = entity.linkedin_url || null;
    if (linkedinUrl) {
      try {
        const liResult = await researchLinkedInPerson(linkedinUrl);
        if (liResult.success) {
          linkedinData = liResult.data;
        } else {
          errors.push({ source: 'linkedin', error: liResult.error });
        }
      } catch (err) {
        errors.push({ source: 'linkedin', error: err.message });
      }
    }

    // Website research
    const companyUrl = entity.company_url || entity.company_website || null;
    if (companyUrl) {
      try {
        const wsResult = await researchWebsite(companyUrl);
        if (wsResult.success) {
          websiteData = wsResult.data;
        } else {
          errors.push({ source: 'website', error: wsResult.error });
        }
      } catch (err) {
        errors.push({ source: 'website', error: err.message });
      }
    }

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
  } catch (err) {
    console.error(`Enrichment ${jobId} failed:`, err);
    await run(
      `UPDATE enrichment_jobs SET status = 'failed', error_log = ?, updated_at = datetime('now') WHERE id = ?`,
      [JSON.stringify({ error: err.message }), jobId]
    ).catch(() => {});
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

    results.push({ jobId, entityType: job.entityType, entityId: job.entityId });

    // Run enrichment async (fire-and-forget)
    enrichEntity(jobId, job.entityType, job.entityId, userId);

    // Rate limit protection: 500ms delay between jobs
    if (jobs.indexOf(job) < jobs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}
