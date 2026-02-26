// Company website scraper — extracts info from the company's own website
// No API key needed, works by fetching the homepage and parsing meta tags + content

import { Agent, fetch as undiciFetch } from 'undici';

// Custom TLS agent that accepts self-signed / misconfigured certificates
// Many company websites (especially smaller ones) have certificate issues
const tlsPermissiveAgent = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
});

const SCRAPER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Referer': 'https://www.google.com/',
  'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'cross-site',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

// Fetch page with retry/fallback for sites that return 403
// Uses undici fetch with permissive TLS agent to handle sites with certificate issues
async function fetchPage(url) {
  const fetchOpts = {
    headers: SCRAPER_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(10000),
    dispatcher: tlsPermissiveAgent,
  };

  // Attempt 1: Direct fetch with Google referer
  try {
    const res = await undiciFetch(url, fetchOpts);
    if (res.ok) return await res.text();

    if (res.status === 403 || res.status === 406) {
      console.log(`Website returned ${res.status} for ${url}, trying alternatives...`);

      // Attempt 2: Try /about and /about-us pages
      for (const path of ['/about', '/about-us']) {
        try {
          const aboutUrl = new URL(path, url).href;
          const aboutRes = await undiciFetch(aboutUrl, {
            ...fetchOpts,
            signal: AbortSignal.timeout(8000),
          });
          if (aboutRes.ok) {
            console.log(`Fetched alternative page: ${aboutUrl}`);
            return await aboutRes.text();
          }
        } catch { /* continue */ }
      }

      // Attempt 3: Google cache fallback
      try {
        const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
        console.log(`Trying Google cache for ${url}...`);
        const cacheRes = await undiciFetch(cacheUrl, fetchOpts);
        if (cacheRes.ok) {
          console.log(`Fetched from Google cache`);
          return await cacheRes.text();
        }
      } catch { /* continue */ }

      return { error: res.status };
    }

    return { error: res.status };
  } catch (err) {
    console.log(`Website fetch error for ${url}: ${err.message}`);
    return { error: err.message };
  }
}

function extractMetaContent(html, property) {
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
    .replace(/&#x2F;/g, '/');
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

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHTMLEntities(match[1].trim()) : null;
}

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

  try {
    // Ensure URL has protocol
    let url = companyUrl;
    if (!url.startsWith('http')) url = `https://${url}`;

    const result = await fetchPage(url);

    if (typeof result !== 'string') {
      return {
        success: false,
        data: null,
        error: `Website returned ${result.error}`,
        profile: null,
      };
    }

    const html = result;

    // Extract basic info from meta tags
    const title = extractMetaContent(html, 'og:title') || extractTitle(html);
    const description = extractMetaContent(html, 'og:description') || extractMetaContent(html, 'description');
    const siteName = extractMetaContent(html, 'og:site_name');
    const image = extractMetaContent(html, 'og:image');
    const keywords = extractMetaContent(html, 'keywords');

    // Extract structured data (JSON-LD)
    const jsonLdItems = extractJsonLd(html);
    let orgData = null;
    let websiteData = null;
    for (const item of jsonLdItems) {
      if (item['@type'] === 'Organization' || item['@type'] === 'Corporation' || item['@type'] === 'LocalBusiness') {
        orgData = item;
      }
      if (item['@type'] === 'WebSite') {
        websiteData = item;
      }
    }

    // Extract social media links from the page
    const socialLinks = {};
    const linkedinMatch = html.match(/href=["'](https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^"']+)["']/i);
    if (linkedinMatch) socialLinks.linkedin = linkedinMatch[1];
    const twitterMatch = html.match(/href=["'](https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[^"']+)["']/i);
    if (twitterMatch) socialLinks.twitter = twitterMatch[1];
    const facebookMatch = html.match(/href=["'](https?:\/\/(?:www\.)?facebook\.com\/[^"']+)["']/i);
    if (facebookMatch) socialLinks.facebook = facebookMatch[1];
    const githubMatch = html.match(/href=["'](https?:\/\/(?:www\.)?github\.com\/[^"']+)["']/i);
    if (githubMatch) socialLinks.github = githubMatch[1];

    // Extract email addresses
    const emailMatches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    const emails = emailMatches ? [...new Set(emailMatches)].slice(0, 5) : [];

    // Extract phone numbers
    const phoneMatches = html.match(/(?:\+\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g);
    const phones = phoneMatches ? [...new Set(phoneMatches)].slice(0, 3) : [];

    // Build data object
    const data = {
      name: orgData?.name || siteName || title || companyName,
      description: orgData?.description || description || null,
      website: url,
      title: title,
      keywords: keywords ? keywords.split(',').map(k => k.trim()).filter(Boolean).slice(0, 10) : [],
      social_links: socialLinks,
      emails: emails,
      phones: phones,
      logo: orgData?.logo || image || null,
      address: orgData?.address
        ? (typeof orgData.address === 'string'
          ? orgData.address
          : `${orgData.address.streetAddress || ''}, ${orgData.address.addressLocality || ''}, ${orgData.address.addressCountry || ''}`.replace(/^[\s,]+|[\s,]+$/g, ''))
        : null,
      founding_date: orgData?.foundingDate || null,
      industry: orgData?.industry || null,
      _source: 'website_scraper',
    };

    return {
      success: true,
      data,
      error: null,
      profile: {
        platform: 'website',
        profile_url: url,
        username: new URL(url).hostname.replace(/^www\./, ''),
        display_name: data.name,
        bio: data.description,
        followers_count: null,
      },
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Website scrape failed: ${err.message}`,
      profile: null,
    };
  }
}
