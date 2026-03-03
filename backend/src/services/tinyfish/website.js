// Company website extraction via AgentQL

import { queryData } from './client.js';

const WEBSITE_QUERY = `{
  company_info {
    name
    description
    industry
    services[]
    products[]
    technologies[]
    team_members[] {
      name
      role
    }
    contact {
      email
      phone
      address
    }
  }
}`;

function normalizeWebsiteData(raw, url) {
  const c = raw?.company_info || raw || {};
  const contact = c.contact || {};

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
    emails: contact.email ? [contact.email] : [],
    phones: contact.phone ? [contact.phone] : [],
    logo: null,
    address: contact.address || null,
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
  const result = await queryData(fullUrl, WEBSITE_QUERY, {
    browserProfile: 'light',
    waitMs: 1000,
  });

  if (!result.success) {
    return { success: false, data: null, error: result.error };
  }

  const normalized = normalizeWebsiteData(result.data, fullUrl);
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
