// Reddit research via Reddit API
// Docs: https://www.reddit.com/dev/api/

const REDDIT_BASE = 'https://oauth.reddit.com';
const REDDIT_PUBLIC = 'https://www.reddit.com';

let cachedAccessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'SalesRoom-Research/1.0',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) return null;
  const data = await res.json();
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedAccessToken;
}

async function authenticatedFetch(path) {
  const token = await getAccessToken();
  if (token) {
    const res = await fetch(`${REDDIT_BASE}${path}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'SalesRoom-Research/1.0',
      },
    });
    if (res.ok) return await res.json();
  }

  // Fallback to public JSON endpoint
  const res = await fetch(`${REDDIT_PUBLIC}${path}.json`, {
    headers: { 'User-Agent': 'SalesRoom-Research/1.0' },
  });
  if (!res.ok) return null;
  return await res.json();
}

async function searchCompanyMentions(companyName) {
  const data = await authenticatedFetch(`/search.json?q=${encodeURIComponent(companyName)}&type=link&sort=relevance&limit=10`);
  if (!data) return [];

  const listing = data.data || data;
  const children = listing.children || [];
  return children.map(c => {
    const post = c.data || c;
    return {
      title: post.title,
      subreddit: post.subreddit,
      score: post.score,
      num_comments: post.num_comments,
      url: post.url,
      created_utc: post.created_utc,
      selftext: post.selftext ? post.selftext.substring(0, 200) : null,
    };
  });
}

async function searchSubreddits(companyName) {
  const data = await authenticatedFetch(`/subreddits/search.json?q=${encodeURIComponent(companyName)}&limit=5`);
  if (!data) return [];

  const listing = data.data || data;
  const children = listing.children || [];
  return children.map(c => {
    const sub = c.data || c;
    return {
      name: sub.display_name,
      title: sub.title,
      subscribers: sub.subscribers,
      description: sub.public_description ? sub.public_description.substring(0, 200) : null,
      url: `https://www.reddit.com/r/${sub.display_name}`,
    };
  });
}

export async function research(companyName, hints = {}) {
  const hasAuth = process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET;

  try {
    const [mentions, subreddits] = await Promise.all([
      searchCompanyMentions(companyName),
      searchSubreddits(companyName),
    ]);

    if (mentions.length === 0 && subreddits.length === 0) {
      return {
        success: false,
        data: null,
        error: `No Reddit mentions found for "${companyName}"`,
        profile: null,
      };
    }

    // Analyze sentiment/topics from mentions
    const topSubreddits = {};
    for (const mention of mentions) {
      if (mention.subreddit) {
        topSubreddits[mention.subreddit] = (topSubreddits[mention.subreddit] || 0) + 1;
      }
    }

    const data = {
      mentions: mentions.slice(0, 10),
      related_subreddits: subreddits.slice(0, 5),
      top_subreddits_mentioned_in: Object.entries(topSubreddits)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, mention_count: count })),
      total_mentions_found: mentions.length,
      authenticated: hasAuth,
    };

    return {
      success: true,
      data,
      error: null,
      profile: {
        platform: 'reddit',
        profile_url: subreddits.length > 0 ? subreddits[0].url : null,
        username: companyName,
        display_name: companyName,
        bio: `${mentions.length} mentions found across Reddit`,
        followers_count: subreddits.length > 0 ? subreddits[0].subscribers : null,
      },
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Reddit research failed: ${err.message}`,
      profile: null,
    };
  }
}
