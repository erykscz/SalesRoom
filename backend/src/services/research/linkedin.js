// LinkedIn research — Proxycurl API (preferred) + public profile scraper (fallback)

const PROXYCURL_BASE = 'https://nubela.co/proxycurl/api';

function getApiKey() {
  return process.env.PROXYCURL_API_KEY;
}

function headers(apiKey) {
  return { 'Authorization': `Bearer ${apiKey}` };
}

// ============================================================================
// PUBLIC PROFILE SCRAPER (fallback when Proxycurl is not configured)
// Fetches public LinkedIn pages and extracts data from meta tags + JSON-LD
// ============================================================================

const SCRAPER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
};

function extractMetaContent(html, property) {
  // Try property="..." and name="..."
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) return decodeHTMLEntities(match[1].trim());
  }
  return null;
}

function decodeHTMLEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—');
}

function extractJsonLd(html) {
  const matches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const results = [];
  for (const match of matches) {
    try {
      results.push(JSON.parse(match[1]));
    } catch { /* ignore invalid JSON-LD */ }
  }
  return results;
}

async function scrapePublicPerson(linkedinUrl) {
  try {
    const res = await fetch(linkedinUrl, {
      headers: SCRAPER_HEADERS,
      redirect: 'follow',
    });

    if (!res.ok) {
      return { success: false, error: `LinkedIn returned ${res.status}`, data: null };
    }

    const html = await res.text();

    // Extract from Open Graph and meta tags
    const title = extractMetaContent(html, 'og:title') || extractMetaContent(html, 'title');
    const description = extractMetaContent(html, 'og:description') || extractMetaContent(html, 'description');
    const image = extractMetaContent(html, 'og:image');

    // Extract from JSON-LD (LinkedIn embeds Person schema)
    const jsonLdItems = extractJsonLd(html);
    let personLd = null;
    for (const item of jsonLdItems) {
      if (item['@type'] === 'Person' || item['@type'] === 'ProfilePage') {
        personLd = item;
        break;
      }
    }

    // Parse name from title: "First Last - Title | LinkedIn" or "First Last – Title | LinkedIn"
    let fullName = null;
    let headline = null;
    if (title) {
      const titleMatch = title.match(/^(.+?)[\s]*[-–—|][\s]*(.+?)[\s]*[-–—|][\s]*LinkedIn/i);
      if (titleMatch) {
        fullName = titleMatch[1].trim();
        headline = titleMatch[2].trim();
      } else {
        const simpleMatch = title.match(/^(.+?)[\s]*[-–—|][\s]*LinkedIn/i);
        if (simpleMatch) fullName = simpleMatch[1].trim();
      }
    }

    // Parse description for more context: "Title at Company. Location. Connections."
    let summary = null;
    let currentCompany = null;
    let location = null;
    if (description) {
      summary = description;
      // Try to extract "Title at Company" pattern
      const roleMatch = description.match(/^(.+?)\s+(?:at|w|bei|chez|presso|en)\s+(.+?)[\.\·]/i);
      if (roleMatch) {
        if (!headline) headline = roleMatch[1].trim();
        currentCompany = roleMatch[2].trim();
      }
      // Try to extract location
      const locMatch = description.match(/(?:Location|Lokalizacja|Standort|Lieu):\s*([^\.·]+)/i);
      if (locMatch) location = locMatch[1].trim();
    }

    // Enrich from JSON-LD if available
    if (personLd) {
      if (personLd.name && !fullName) fullName = personLd.name;
      if (personLd.jobTitle && !headline) headline = personLd.jobTitle;
      if (personLd.address) {
        const addr = personLd.address;
        if (!location) location = addr.addressLocality || addr.addressRegion || addr.addressCountry;
      }
      if (personLd.worksFor) {
        const wf = Array.isArray(personLd.worksFor) ? personLd.worksFor[0] : personLd.worksFor;
        if (wf && !currentCompany) currentCompany = wf.name;
      }
    }

    if (!fullName && !headline) {
      return { success: false, error: 'Could not extract profile data from LinkedIn page', data: null };
    }

    const data = {
      full_name: fullName,
      headline: headline,
      summary: summary,
      occupation: headline,
      city: location,
      country: null,
      connections: null,
      follower_count: null,
      linkedin_url: linkedinUrl,
      profile_pic_url: image,
      experiences: currentCompany ? [{ title: headline, company: currentCompany, starts_at: null, ends_at: null, description: null }] : [],
      education: [],
      skills: [],
      languages: [],
      _source: 'scraper',
    };

    return { success: true, data, error: null };
  } catch (err) {
    return { success: false, error: `LinkedIn scrape failed: ${err.message}`, data: null };
  }
}

async function scrapePublicCompany(linkedinUrl) {
  try {
    const res = await fetch(linkedinUrl, {
      headers: SCRAPER_HEADERS,
      redirect: 'follow',
    });

    if (!res.ok) {
      return { success: false, error: `LinkedIn returned ${res.status}`, data: null };
    }

    const html = await res.text();

    const title = extractMetaContent(html, 'og:title') || extractMetaContent(html, 'title');
    const description = extractMetaContent(html, 'og:description') || extractMetaContent(html, 'description');
    const image = extractMetaContent(html, 'og:image');

    const jsonLdItems = extractJsonLd(html);
    let orgLd = null;
    for (const item of jsonLdItems) {
      if (item['@type'] === 'Organization' || item['@type'] === 'Corporation') {
        orgLd = item;
        break;
      }
    }

    let companyName = null;
    if (title) {
      const nameMatch = title.match(/^(.+?)[\s]*[-–—|][\s]*LinkedIn/i);
      if (nameMatch) companyName = nameMatch[1].trim();
    }

    if (orgLd) {
      if (orgLd.name && !companyName) companyName = orgLd.name;
    }

    if (!companyName && !description) {
      return { success: false, error: 'Could not extract company data from LinkedIn page', data: null };
    }

    const data = {
      name: companyName,
      description: description,
      industry: null,
      website: orgLd?.url || null,
      company_size: null,
      follower_count: null,
      headquarters: null,
      founded_year: orgLd?.foundingDate ? parseInt(orgLd.foundingDate) : null,
      specialities: [],
      linkedin_url: linkedinUrl,
      tagline: null,
      company_type: null,
      profile_pic_url: image,
      _source: 'scraper',
    };

    return { success: true, data, error: null };
  } catch (err) {
    return { success: false, error: `LinkedIn company scrape failed: ${err.message}`, data: null };
  }
}

// ============================================================================
// PROXYCURL API (primary — used when API key is available)
// ============================================================================

async function resolveCompanyUrl(companyName, apiKey) {
  const url = `${PROXYCURL_BASE}/linkedin/company/resolve?company_name=${encodeURIComponent(companyName)}`;
  const res = await fetch(url, { headers: headers(apiKey) });
  if (!res.ok) return null;
  const data = await res.json();
  return data.url || null;
}

async function resolvePersonUrl(name, companyName, apiKey) {
  const nameParts = (name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
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

  // Try Proxycurl first if available
  if (apiKey) {
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
      console.error('Proxycurl company lookup failed, trying scraper:', err.message);
    }
  }

  // Fallback: scrape public profile if we have a URL
  if (linkedinUrl) {
    return await scrapePublicCompany(linkedinUrl);
  }

  return { success: false, error: 'No Proxycurl API key and no LinkedIn URL provided', data: null };
}

export async function lookupPerson(name, companyName, linkedinUrl = null) {
  const apiKey = getApiKey();

  // Try Proxycurl first if available
  if (apiKey) {
    try {
      if (!linkedinUrl) {
        if (!name) {
          return { success: false, error: 'No LinkedIn URL or name provided for person lookup', data: null };
        }
        linkedinUrl = await resolvePersonUrl(name, companyName, apiKey);
        if (!linkedinUrl) {
          // Proxycurl couldn't resolve — no fallback without URL
          return { success: false, error: `Person "${name}" not found on LinkedIn`, data: null };
        }
      }

      const url = `${PROXYCURL_BASE}/v2/linkedin?url=${encodeURIComponent(linkedinUrl)}&use_cache=if-present`;
      const res = await fetch(url, { headers: headers(apiKey) });

      if (res.status === 404) {
        return { success: false, error: 'LinkedIn person profile not found', data: null };
      }
      if (res.status === 429) {
        // Fall through to scraper
        console.warn('Proxycurl rate limited, trying scraper fallback');
      } else if (!res.ok) {
        console.warn(`Proxycurl error ${res.status}, trying scraper fallback`);
      } else {
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
      }
    } catch (err) {
      console.error('Proxycurl person lookup failed, trying scraper:', err.message);
    }
  }

  // Fallback: scrape public profile if we have a URL
  if (linkedinUrl) {
    return await scrapePublicPerson(linkedinUrl);
  }

  if (!name) {
    return { success: false, error: 'No LinkedIn URL or name provided for person lookup', data: null };
  }

  return { success: false, error: `Cannot look up "${name}" without Proxycurl API key or direct LinkedIn URL`, data: null };
}

export async function research(companyName, hints = {}) {
  const results = { company: null, person: null };

  const companyResult = await lookupCompany(companyName, hints.linkedin_company_url);
  if (companyResult.success) {
    results.company = companyResult.data;
  }

  // Use company domain from hints for better person resolution
  const companyDomain = hints.company_url
    ? hints.company_url.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
    : companyName;

  // Look up person if we have a direct URL or a name to resolve
  if (hints.linkedin_person_url || hints.name) {
    const personResult = await lookupPerson(
      hints.name || null,
      companyDomain,
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
