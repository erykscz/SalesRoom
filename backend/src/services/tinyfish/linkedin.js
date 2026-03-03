// LinkedIn extraction via TinyFish Web Agent

import { runAutomation } from './client.js';

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

const PERSON_GOAL = `Extract the following information from this LinkedIn profile page and return it as JSON:
- full_name: the person's full name
- headline: their professional headline
- about_summary: the "About" section text
- location: their location
- experiences: array of work experiences, each with { title, company, duration, description }
- education: array of education entries, each with { school, degree, field_of_study }
- skills: array of skill names (strings)

Return ONLY valid JSON with these fields. If a field is not found, use null.`;

const COMPANY_GOAL = `Extract the following information from this LinkedIn company page and return it as JSON:
- name: company name
- description: company description/about text
- industry: industry
- company_size: number of employees or size range
- headquarters: location of headquarters
- website: company website URL
- specialties: areas of specialization (as array of strings)
- founded: year founded

Return ONLY valid JSON with these fields. If a field is not found, use null.`;

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

function normalizeCompanyData(raw, linkedinUrl) {
  const c = raw || {};
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

function parseResult(data) {
  if (!data) return null;
  // TinyFish returns result which may be a string or object
  if (typeof data === 'string') {
    try {
      // Strip markdown code fences if present
      const cleaned = data.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
  return data;
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
  const result = await runAutomation(linkedinUrl, PERSON_GOAL, {
    browserProfile: 'stealth',
  });

  if (!result.success) {
    return { success: false, data: null, error: result.error };
  }

  const parsed = parseResult(result.data);
  if (!parsed) {
    return { success: false, data: null, error: 'TinyFish returned unparseable result' };
  }

  const normalized = normalizePersonData(parsed, linkedinUrl);
  return { success: true, data: normalized, error: null };
}

export async function researchLinkedInCompany(url) {
  if (!url) {
    return { success: false, data: null, error: 'No LinkedIn company URL provided' };
  }

  console.log(`TinyFish: Extracting LinkedIn company data from ${url}`);
  const result = await runAutomation(url, COMPANY_GOAL, {
    browserProfile: 'stealth',
  });

  if (!result.success) {
    return { success: false, data: null, error: result.error };
  }

  const parsed = parseResult(result.data);
  if (!parsed) {
    return { success: false, data: null, error: 'TinyFish returned unparseable result' };
  }

  const normalized = normalizeCompanyData(parsed, url);
  return { success: true, data: normalized, error: null };
}

// Adapter signature matching existing research/linkedin.js
export async function research(companyName, hints = {}) {
  const results = { company: null, person: null };

  const personUrl = hints.linkedin_person_url || null;
  if (personUrl) {
    const personResult = await researchLinkedInPerson(personUrl, hints);
    if (personResult.success) {
      results.person = personResult.data;
    }
  }

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
