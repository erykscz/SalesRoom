// LinkedIn extraction via AgentQL

import { queryData } from './client.js';

function isSalesNavUrl(url) {
  if (!url) return false;
  return /linkedin\.com\/sales\/(lead|people|profile|company)/i.test(url);
}

function convertSalesNavUrl(url) {
  if (!url) return null;
  const match = url.match(/\/sales\/(?:lead|profile)\/([A-Za-z0-9_-]+)/);
  if (!match) return null;
  return `https://www.linkedin.com/in/${match[1]}`;
}

const PERSON_QUERY = `{
  profile {
    full_name
    headline
    about_summary
    location
    experiences[] {
      title
      company
      duration
      description
    }
    education[] {
      school
      degree
      field_of_study
    }
    skills[]
  }
}`;

const COMPANY_QUERY = `{
  company {
    name
    description
    industry
    company_size
    headquarters
    website
    specialties
    founded
  }
}`;

function normalizePersonData(raw, linkedinUrl) {
  const p = raw?.profile || raw || {};
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

function normalizeCompanyData(raw, linkedinUrl) {
  const c = raw?.company || raw || {};
  return {
    name: c.name || null,
    description: c.description || null,
    industry: c.industry || null,
    website: c.website || null,
    company_size: c.company_size || null,
    follower_count: null,
    headquarters: c.headquarters || null,
    founded_year: c.founded ? parseInt(c.founded) : null,
    specialities: c.specialties ? (Array.isArray(c.specialties) ? c.specialties : [c.specialties]) : [],
    linkedin_url: linkedinUrl,
    tagline: null,
    company_type: null,
    profile_pic_url: null,
    _source: 'tinyfish',
  };
}

export async function researchLinkedInPerson(url, hints = {}) {
  let linkedinUrl = url;

  if (linkedinUrl && isSalesNavUrl(linkedinUrl)) {
    const converted = convertSalesNavUrl(linkedinUrl);
    if (converted) {
      console.log(`TinyFish: Sales Nav URL converted: ${linkedinUrl} → ${converted}`);
      linkedinUrl = converted;
    } else {
      return { success: false, data: null, error: 'Could not convert Sales Navigator URL' };
    }
  }

  if (!linkedinUrl) {
    return { success: false, data: null, error: 'No LinkedIn URL provided for person' };
  }

  console.log(`TinyFish: Extracting LinkedIn person data from ${linkedinUrl}`);
  const result = await queryData(linkedinUrl, PERSON_QUERY, {
    browserProfile: 'stealth',
    waitMs: 2000,
  });

  if (!result.success) {
    return { success: false, data: null, error: result.error };
  }

  const normalized = normalizePersonData(result.data, linkedinUrl);
  return { success: true, data: normalized, error: null };
}

export async function researchLinkedInCompany(url) {
  if (!url) {
    return { success: false, data: null, error: 'No LinkedIn company URL provided' };
  }

  console.log(`TinyFish: Extracting LinkedIn company data from ${url}`);
  const result = await queryData(url, COMPANY_QUERY, {
    browserProfile: 'stealth',
    waitMs: 2000,
  });

  if (!result.success) {
    return { success: false, data: null, error: result.error };
  }

  const normalized = normalizeCompanyData(result.data, url);
  return { success: true, data: normalized, error: null };
}

// Adapter signature matching existing research/linkedin.js
export async function research(companyName, hints = {}) {
  const results = { company: null, person: null };

  // Person lookup
  const personUrl = hints.linkedin_person_url || null;
  if (personUrl) {
    const personResult = await researchLinkedInPerson(personUrl, hints);
    if (personResult.success) {
      results.person = personResult.data;
    }
  }

  // Company lookup — try company URL or construct from company name
  const companyUrl = hints.linkedin_company_url || null;
  if (companyUrl) {
    const companyResult = await researchLinkedInCompany(companyUrl);
    if (companyResult.success) {
      results.company = companyResult.data;
    }
  }

  const hasData = results.company || results.person;
  const hasPerson = results.person;

  return {
    success: hasData ? true : false,
    data: hasData ? results : null,
    error: hasData ? null : 'No LinkedIn data extracted via TinyFish',
    profile: {
      platform: 'linkedin',
      profile_url: hasPerson ? results.person.linkedin_url : (results.company?.linkedin_url || null),
      username: hasPerson ? results.person.full_name : companyName,
      display_name: hasPerson ? results.person.full_name : (results.company?.name || companyName),
      bio: hasPerson ? (results.person.headline || results.person.summary) : (results.company?.description || null),
      followers_count: hasPerson ? results.person.follower_count : (results.company?.follower_count || null),
    },
  };
}
