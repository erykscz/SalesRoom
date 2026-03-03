// Company website extraction via TinyFish Web Agent

import { runAutomation } from './client.js';

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

function normalizeWebsiteData(raw, url) {
  const c = raw || {};

  return {
    name: c.name || null,
    description: c.description || null,
    website: url,
    title: c.name || null,
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

export async function researchWebsite(url) {
  if (!url) {
    return { success: false, data: null, error: 'No website URL provided' };
  }

  let fullUrl = url;
  if (!fullUrl.startsWith('http')) fullUrl = `https://${fullUrl}`;

  console.log(`TinyFish: Extracting website data from ${fullUrl}`);
  const result = await runAutomation(fullUrl, WEBSITE_GOAL, {
    browserProfile: 'lite',
  });

  if (!result.success) {
    return { success: false, data: null, error: result.error };
  }

  const parsed = parseResult(result.data);
  if (!parsed) {
    return { success: false, data: null, error: 'TinyFish returned unparseable result' };
  }

  const normalized = normalizeWebsiteData(parsed, fullUrl);
  return { success: true, data: normalized, error: null };
}

// Adapter signature matching existing research/website.js
export async function research(companyName, hints = {}) {
  const companyUrl = hints.company_url;
  if (!companyUrl) {
    return {
      success: false,
      data: null,
      error: 'No company website URL provided',
      profile: null,
    };
  }

  const result = await researchWebsite(companyUrl);

  if (!result.success) {
    return {
      success: false,
      data: null,
      error: result.error,
      profile: null,
    };
  }

  let hostname;
  try {
    hostname = new URL(result.data.website).hostname.replace(/^www\./, '');
  } catch {
    hostname = companyUrl;
  }

  return {
    success: true,
    data: result.data,
    error: null,
    profile: {
      platform: 'website',
      profile_url: result.data.website,
      username: hostname,
      display_name: result.data.name || companyName,
      bio: result.data.description,
      followers_count: null,
    },
  };
}
