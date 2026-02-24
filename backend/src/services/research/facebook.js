// Facebook research via Graph API
// Docs: https://developers.facebook.com/docs/graph-api
// Note: This is the most limited platform - restricted to public page data

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';

function getAccessToken() {
  return process.env.FACEBOOK_ACCESS_TOKEN;
}

async function searchPages(companyName, token) {
  const fields = 'name,about,category,fan_count,website,phone,emails,location,link,description,founded';
  const url = `${GRAPH_BASE}/pages/search?q=${encodeURIComponent(companyName)}&fields=${fields}&access_token=${token}&limit=3`;

  const res = await fetch(url);
  if (!res.ok) {
    // Page search requires pages_read_engagement permission which is hard to get
    // Fall back to direct ID search if possible
    return null;
  }
  const json = await res.json();
  return json.data || [];
}

async function getPage(pageId, token) {
  const fields = 'name,about,category,fan_count,website,phone,emails,location,link,description,founded,single_line_address';
  const url = `${GRAPH_BASE}/${pageId}?fields=${fields}&access_token=${token}`;

  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.json();
}

export async function research(companyName, hints = {}) {
  const token = getAccessToken();
  if (!token) {
    return { success: false, error: 'FACEBOOK_ACCESS_TOKEN not configured', data: null, profile: null };
  }

  try {
    let page = null;

    if (hints.facebook_page_id) {
      page = await getPage(hints.facebook_page_id, token);
    }

    if (!page) {
      const pages = await searchPages(companyName, token);
      if (pages && pages.length > 0) {
        // Pick the best match by name similarity
        page = pages.find(p => p.name.toLowerCase().includes(companyName.toLowerCase())) || pages[0];
      }
    }

    if (!page) {
      return {
        success: false,
        data: null,
        error: `Facebook page for "${companyName}" not found (Facebook API access is limited)`,
        profile: null,
      };
    }

    const data = {
      name: page.name,
      about: page.about,
      description: page.description,
      category: page.category,
      fan_count: page.fan_count,
      website: page.website,
      phone: page.phone,
      emails: page.emails || [],
      location: page.location,
      address: page.single_line_address,
      founded: page.founded,
      link: page.link,
    };

    return {
      success: true,
      data,
      error: null,
      profile: {
        platform: 'facebook',
        profile_url: page.link || null,
        username: page.name,
        display_name: page.name,
        bio: page.about || page.description || null,
        followers_count: page.fan_count || null,
      },
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Facebook research failed: ${err.message}`,
      profile: null,
    };
  }
}
