// LinkedIn research via Proxycurl API
// Docs: https://nubela.co/proxycurl/docs

const PROXYCURL_BASE = 'https://nubela.co/proxycurl/api';

function getApiKey() {
  return process.env.PROXYCURL_API_KEY;
}

function headers(apiKey) {
  return { 'Authorization': `Bearer ${apiKey}` };
}

async function resolveCompanyUrl(companyName, apiKey) {
  const url = `${PROXYCURL_BASE}/linkedin/company/resolve?company_name=${encodeURIComponent(companyName)}`;
  const res = await fetch(url, { headers: headers(apiKey) });
  if (!res.ok) return null;
  const data = await res.json();
  return data.url || null;
}

async function resolvePersonUrl(firstName, lastName, companyName, apiKey) {
  const params = new URLSearchParams({
    first_name: firstName,
    last_name: lastName,
    company_domain: companyName,
  });
  const url = `${PROXYCURL_BASE}/linkedin/profile/resolve?${params}`;
  const res = await fetch(url, { headers: headers(apiKey) });
  if (!res.ok) return null;
  const data = await res.json();
  return data.url || null;
}

export async function lookupCompany(companyName, linkedinUrl = null) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { success: false, error: 'PROXYCURL_API_KEY not configured', data: null };
  }

  try {
    if (!linkedinUrl) {
      linkedinUrl = await resolveCompanyUrl(companyName, apiKey);
      if (!linkedinUrl) {
        return { success: false, error: `Company "${companyName}" not found on LinkedIn`, data: null };
      }
    }

    const url = `${PROXYCURL_BASE}/v2/linkedin/company?url=${encodeURIComponent(linkedinUrl)}&use_cache=if-present`;
    const res = await fetch(url, { headers: headers(apiKey) });

    if (res.status === 404) {
      return { success: false, error: 'LinkedIn company profile not found', data: null };
    }
    if (res.status === 429) {
      return { success: false, error: 'Proxycurl rate limit exceeded, try again later', data: null };
    }
    if (!res.ok) {
      return { success: false, error: `Proxycurl API error: ${res.status}`, data: null };
    }

    const raw = await res.json();

    const data = {
      name: raw.name,
      description: raw.description,
      industry: raw.industry,
      website: raw.website,
      company_size: raw.company_size_on_linkedin,
      follower_count: raw.follower_count,
      headquarters: raw.hq ? `${raw.hq.city}, ${raw.hq.country}` : null,
      founded_year: raw.founded_year,
      specialities: raw.specialities || [],
      linkedin_url: raw.linkedin_internal_id ? `https://www.linkedin.com/company/${raw.linkedin_internal_id}` : linkedinUrl,
      tagline: raw.tagline,
      company_type: raw.company_type,
      profile_pic_url: raw.profile_pic_url,
    };

    return { success: true, data, error: null };
  } catch (err) {
    return { success: false, error: `LinkedIn lookup failed: ${err.message}`, data: null };
  }
}

export async function lookupPerson(firstName, lastName, companyName, linkedinUrl = null) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { success: false, error: 'PROXYCURL_API_KEY not configured', data: null };
  }

  try {
    if (!linkedinUrl) {
      linkedinUrl = await resolvePersonUrl(firstName, lastName, companyName, apiKey);
      if (!linkedinUrl) {
        return { success: false, error: `Person "${firstName} ${lastName}" not found on LinkedIn`, data: null };
      }
    }

    const url = `${PROXYCURL_BASE}/v2/linkedin?url=${encodeURIComponent(linkedinUrl)}&use_cache=if-present`;
    const res = await fetch(url, { headers: headers(apiKey) });

    if (res.status === 404) {
      return { success: false, error: 'LinkedIn person profile not found', data: null };
    }
    if (res.status === 429) {
      return { success: false, error: 'Proxycurl rate limit exceeded', data: null };
    }
    if (!res.ok) {
      return { success: false, error: `Proxycurl API error: ${res.status}`, data: null };
    }

    const raw = await res.json();

    const data = {
      full_name: raw.full_name,
      headline: raw.headline,
      summary: raw.summary,
      occupation: raw.occupation,
      city: raw.city,
      country: raw.country_full_name,
      connections: raw.connections,
      follower_count: raw.follower_count,
      linkedin_url: linkedinUrl,
      profile_pic_url: raw.profile_pic_url,
      experiences: (raw.experiences || []).slice(0, 3).map(e => ({
        title: e.title,
        company: e.company,
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        description: e.description,
      })),
      education: (raw.education || []).slice(0, 2).map(e => ({
        school: e.school,
        degree_name: e.degree_name,
        field_of_study: e.field_of_study,
      })),
      skills: (raw.skills || []).slice(0, 10),
      languages: raw.languages || [],
    };

    return { success: true, data, error: null };
  } catch (err) {
    return { success: false, error: `LinkedIn person lookup failed: ${err.message}`, data: null };
  }
}

export async function research(companyName, hints = {}) {
  const results = { company: null, person: null };

  const companyResult = await lookupCompany(companyName, hints.linkedin_company_url);
  if (companyResult.success) {
    results.company = companyResult.data;
  }

  if (hints.first_name && hints.last_name) {
    const personResult = await lookupPerson(
      hints.first_name,
      hints.last_name,
      companyName,
      hints.linkedin_person_url
    );
    if (personResult.success) {
      results.person = personResult.data;
    }
  }

  const hasData = results.company || results.person;

  // Prioritize person data in the profile when available
  const hasPerson = results.person;
  return {
    success: hasData ? true : false,
    data: hasData ? results : null,
    error: hasData ? null : (companyResult.error || 'No LinkedIn data found'),
    profile: {
      platform: 'linkedin',
      profile_url: hasPerson ? results.person.linkedin_url : (results.company?.linkedin_url || hints.linkedin_company_url || null),
      username: hasPerson ? results.person.full_name : companyName,
      display_name: hasPerson ? results.person.full_name : (results.company?.name || companyName),
      bio: hasPerson ? (results.person.headline || results.person.summary) : (results.company?.description || null),
      followers_count: hasPerson ? results.person.follower_count : (results.company?.follower_count || null),
    }
  };
}
