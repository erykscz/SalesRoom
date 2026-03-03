// Facebook research via Apify
// Actor: apify/facebook-pages-scraper
// Replaces official Facebook Graph API when APIFY_API_TOKEN is configured

import { runActorAndWaitForResults } from './client.js';

const ACTOR_ID = 'apify~facebook-pages-scraper';

export async function research(companyName, hints = {}) {
  try {
    // Build start URLs - use direct page URL if available, otherwise search
    const startUrls = [];
    if (hints.facebook_page_url) {
      startUrls.push({ url: hints.facebook_page_url });
    } else if (hints.facebook_page_id) {
      startUrls.push({ url: `https://www.facebook.com/${hints.facebook_page_id}` });
    } else {
      // Search by company name
      startUrls.push({ url: `https://www.facebook.com/search/pages/?q=${encodeURIComponent(companyName)}` });
    }

    const input = {
      startUrls,
      maxPages: 3,
      maxPagesPerQuery: 3,
    };

    const result = await runActorAndWaitForResults(ACTOR_ID, input, {
      timeoutMs: 120000,
      pollIntervalMs: 4000,
      maxItems: 5,
    });

    if (!result.success || result.items.length === 0) {
      return {
        success: false,
        data: null,
        error: result.error || `No Facebook data found for "${companyName}" via Apify`,
        profile: null,
      };
    }

    // Pick the best match
    const page = findBestMatch(result.items, companyName);

    if (!page) {
      return {
        success: false,
        data: null,
        error: `Facebook page for "${companyName}" not found via Apify`,
        profile: null,
      };
    }

    const data = {
      name: page.title || page.name || null,
      about: page.about || null,
      description: page.description || page.info || null,
      category: page.categories ? page.categories.join(', ') : (page.category || null),
      fan_count: page.likes || page.followersCount || page.fans || null,
      website: page.website || null,
      phone: page.phone || null,
      emails: extractEmails(page),
      location: page.address || page.location || null,
      address: page.address?.street
        ? `${page.address.street}, ${page.address.city || ''}, ${page.address.country || ''}`.trim()
        : (typeof page.address === 'string' ? page.address : null),
      founded: page.founded || null,
      link: page.url || page.pageUrl || null,
      _source: 'apify',
    };

    return {
      success: true,
      data,
      error: null,
      profile: {
        platform: 'facebook',
        profile_url: page.url || page.pageUrl || null,
        username: page.title || page.name || companyName,
        display_name: page.title || page.name || companyName,
        bio: page.about || page.description || null,
        followers_count: page.likes || page.followersCount || null,
      },
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Facebook research via Apify failed: ${err.message}`,
      profile: null,
    };
  }
}

function findBestMatch(items, companyName) {
  if (items.length === 1) return items[0];

  const nameLower = companyName.toLowerCase();

  // Exact name match
  const exact = items.find(item => {
    const title = (item.title || item.name || '').toLowerCase();
    return title === nameLower;
  });
  if (exact) return exact;

  // Partial name match
  const partial = items.find(item => {
    const title = (item.title || item.name || '').toLowerCase();
    return title.includes(nameLower) || nameLower.includes(title);
  });
  if (partial) return partial;

  // Default to first result
  return items[0];
}

function extractEmails(page) {
  if (page.emails && Array.isArray(page.emails)) return page.emails;
  if (page.email) return [page.email];
  // Try to find email in contact info or about text
  const text = `${page.about || ''} ${page.info || ''}`;
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/g);
  return emailMatch || [];
}
