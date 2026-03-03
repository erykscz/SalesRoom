// Enrichment pipeline orchestrator
// Strategy:
// 1. POST /enrich → starts TinyFish async runs, saves run IDs, returns immediately
// 2. GET /jobs/:id/check → polls TinyFish for results, updates DB when done

import { v4 as uuidv4 } from 'uuid';
import { run, get } from '../../db/database.js';
import { startAutomation, getRun } from './client.js';

const PERSON_GOAL = `Extract the following information from this LinkedIn profile page and return it as JSON:
- full_name: the person's full name
- headline: their professional headline
- about_summary: the "About" section text
- location: their location
- experiences: array of work experiences, each with { title, company, duration, description }
- education: array of education entries, each with { school, degree, field_of_study }
- skills: array of skill names (strings)
Return ONLY valid JSON with these fields. If a field is not found, use null.`;

const WEBSITE_GOAL = `Extract the following information from this company website and return it as JSON:
- name: company name
- description: what the company does (brief summary)
- industry: industry or sector
- services: array of services offered (strings)
- products: array of products (strings)
- technologies: array of technologies used or offered (strings)
- team_members: array of team members, each with { name, role } (max 10)
- contact_email: contact email address
- contact_phone: contact phone number
- address: physical address
Return ONLY valid JSON with these fields. If a field is not found, use null or empty array.`;

function parseResult(data) {
  if (!data) return null;
  if (typeof data === 'string') {
    try {
      const cleaned = data.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
  return data;
}

function normalizePersonData(raw, linkedinUrl) {
  const p = raw || {};
  return {
    full_name: p.full_name || null,
    headline: p.headline || null,
    summary: p.about_summary || p.summary || null,
    occupation: p.headline || null,
    city: p.location || null,
    country: null,
    connections: null,
    follower_count: null,
    linkedin_url: linkedinUrl,
    profile_pic_url: null,
    experiences: (p.experiences || []).slice(0, 5).map(e => ({
      title: e.title || null,
      company: e.company || null,
      starts_at: null,
      ends_at: null,
      description: e.description || e.duration || null,
    })),
    education: (p.education || []).slice(0, 3).map(e => ({
      school: e.school || null,
      degree_name: e.degree || null,
      field_of_study: e.field_of_study || null,
    })),
    skills: (p.skills || []).slice(0, 15),
    languages: [],
    _source: 'tinyfish',
  };
}

function normalizeWebsiteData(raw, url) {
  const c = raw || {};
  return {
    name: c.name || c.company_name || null,
    description: c.description || c.brief_description || null,
    website: url,
    title: c.name || c.company_name || null,
    industry: c.industry || null,
    services: Array.isArray(c.services) ? c.services : [],
    products: Array.isArray(c.products) ? c.products : [],
    technologies: Array.isArray(c.technologies) ? c.technologies : [],
    team_members: Array.isArray(c.team_members) ? c.team_members.slice(0, 10) : [],
    keywords: [
      ...(Array.isArray(c.services) ? c.services.slice(0, 3) : []),
      ...(Array.isArray(c.technologies) ? c.technologies.slice(0, 3) : []),
    ],
    social_links: {},
    emails: c.contact_email ? [c.contact_email] : [],
    phones: c.contact_phone ? [c.contact_phone] : [],
    logo: null,
    address: c.address || null,
    founding_date: null,
    _source: 'tinyfish',
  };
}

/**
 * Start enrichment — fires off async TinyFish requests, stores run IDs.
 * Returns immediately with the enrichment job ID.
 */
export async function startEnrichment(jobId, entityType, entityId, userId) {
  try {
    await run(
      `UPDATE enrichment_jobs SET status = 'running', updated_at = datetime('now') WHERE id = ?`,
      [jobId]
    );

    let entity;
    if (entityType === 'deal') {
      entity = await get('SELECT * FROM deals WHERE id = ?', [entityId]);
    } else {
      entity = await get('SELECT * FROM leads WHERE id = ?', [entityId]);
    }

    if (!entity) {
      await run(
        `UPDATE enrichment_jobs SET status = 'failed', error_log = ?, updated_at = datetime('now') WHERE id = ?`,
        [JSON.stringify([{ error: `${entityType} not found` }]), jobId]
      );
      return { started: false, error: `${entityType} not found` };
    }

    const linkedinUrl = entity.linkedin_url || null;
    const companyUrl = entity.company_url || entity.company_website || null;
    const runIds = {};

    // Start LinkedIn async run
    if (linkedinUrl) {
      let url = linkedinUrl;
      // Convert Sales Navigator URLs
      if (/linkedin\.com\/sales\//i.test(url)) {
        const match = url.match(/\/sales\/(?:lead|profile)\/([A-Za-z0-9_-]+)/);
        if (match) url = `https://www.linkedin.com/in/${match[1]}`;
      }
      const result = await startAutomation(url, PERSON_GOAL, { browserProfile: 'stealth' });
      if (result.success) {
        runIds.linkedin = result.runId;
      }
    }

    // Start website async run
    if (companyUrl) {
      let url = companyUrl;
      if (!url.startsWith('http')) url = `https://${url}`;
      const result = await startAutomation(url, WEBSITE_GOAL, { browserProfile: 'lite' });
      if (result.success) {
        runIds.website = result.runId;
      }
    }

    if (Object.keys(runIds).length === 0) {
      await run(
        `UPDATE enrichment_jobs SET status = 'completed', error_log = ?, updated_at = datetime('now'), completed_at = datetime('now') WHERE id = ?`,
        [JSON.stringify([{ error: 'No LinkedIn or website URL to enrich' }]), jobId]
      );
      return { started: false, error: 'No URLs to enrich' };
    }

    // Store TinyFish run IDs in the job's linkedin_data field temporarily
    await run(
      `UPDATE enrichment_jobs SET linkedin_data = ?, updated_at = datetime('now') WHERE id = ?`,
      [JSON.stringify({ _tinyfish_runs: runIds, _linkedin_url: linkedinUrl, _company_url: companyUrl }), jobId]
    );

    return { started: true, runIds };
  } catch (err) {
    console.error(`Enrichment ${jobId} start failed:`, err);
    await run(
      `UPDATE enrichment_jobs SET status = 'failed', error_log = ?, updated_at = datetime('now') WHERE id = ?`,
      [JSON.stringify([{ error: err.message }]), jobId]
    ).catch(() => {});
    return { started: false, error: err.message };
  }
}

/**
 * Check TinyFish run statuses and finalize the enrichment job if all done.
 */
export async function checkEnrichment(jobId) {
  const job = await get('SELECT * FROM enrichment_jobs WHERE id = ?', [jobId]);
  if (!job) return { status: 'not_found' };
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'partial') {
    return { status: job.status, done: true };
  }

  // Parse stored run IDs
  let meta;
  try { meta = JSON.parse(job.linkedin_data); } catch { return { status: job.status, done: false }; }
  if (!meta?._tinyfish_runs) return { status: job.status, done: false };

  const runs = meta._tinyfish_runs;
  const errors = [];
  let linkedinData = null;
  let websiteData = null;
  let allDone = true;

  // Check LinkedIn run
  if (runs.linkedin) {
    const r = await getRun(runs.linkedin);
    if (r.status === 'COMPLETED') {
      const parsed = parseResult(r.result);
      if (parsed) linkedinData = normalizePersonData(parsed, meta._linkedin_url);
      else errors.push({ source: 'linkedin', error: 'Unparseable result from TinyFish' });
    } else if (r.status === 'FAILED') {
      errors.push({ source: 'linkedin', error: r.error?.message || 'TinyFish run failed' });
    } else {
      allDone = false;
    }
  }

  // Check website run
  if (runs.website) {
    const r = await getRun(runs.website);
    if (r.status === 'COMPLETED') {
      const parsed = parseResult(r.result);
      if (parsed) websiteData = normalizeWebsiteData(parsed, meta._company_url);
      else errors.push({ source: 'website', error: 'Unparseable result from TinyFish' });
    } else if (r.status === 'FAILED') {
      errors.push({ source: 'website', error: r.error?.message || 'TinyFish run failed' });
    } else {
      allDone = false;
    }
  }

  if (!allDone) {
    return { status: 'running', done: false };
  }

  // All TinyFish runs complete — finalize
  const hasData = linkedinData || websiteData;
  const hasUrls = runs.linkedin || runs.website;
  const allFailed = !linkedinData && !websiteData && hasUrls;
  const finalStatus = allFailed ? 'failed' : hasData ? (errors.length > 0 ? 'partial' : 'completed') : 'completed';

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
      finalStatus,
      linkedinData ? JSON.stringify(linkedinData) : null,
      websiteData ? JSON.stringify(websiteData) : null,
      errors.length > 0 ? JSON.stringify(errors) : null,
      jobId,
    ]
  );

  // Store on entity
  const enrichmentPayload = JSON.stringify({
    linkedin: linkedinData,
    website: websiteData,
    enriched_at: new Date().toISOString(),
    provider: 'tinyfish',
  });

  if (job.entity_type === 'deal') {
    await run(
      `UPDATE deals SET tinyfish_research = ?, last_enriched = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [enrichmentPayload, job.entity_id]
    );
  } else {
    await run(
      `UPDATE leads SET enrichment_data = ?, enriched_at = datetime('now'), enrichment_status = ?, updated_at = datetime('now') WHERE id = ?`,
      [enrichmentPayload, finalStatus, job.entity_id]
    );
  }

  console.log(`Enrichment ${jobId} completed with status: ${finalStatus}`);
  return { status: finalStatus, done: true, linkedinData, websiteData, errors };
}
