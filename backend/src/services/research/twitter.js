// Twitter/X research via Twitter API v2
// Docs: https://developer.twitter.com/en/docs/twitter-api

const TWITTER_BASE = 'https://api.twitter.com/2';

function getBearerToken() {
  return process.env.TWITTER_BEARER_TOKEN;
}

function headers(token) {
  return { 'Authorization': `Bearer ${token}` };
}

async function lookupByUsername(username, token) {
  const fields = 'description,public_metrics,profile_image_url,location,url,created_at,verified';
  const url = `${TWITTER_BASE}/users/by/username/${encodeURIComponent(username)}?user.fields=${fields}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) return { ok: false, status: res.status, data: null };
  const json = await res.json();
  return { ok: true, status: res.status, data: json.data || null };
}

async function searchUser(companyName, token) {
  // Twitter API v2 doesn't have a direct user search endpoint on free tier
  // Try the username directly (company names often match handles)
  const cleaned = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const result = await lookupByUsername(cleaned, token);
  if (result.ok && result.data) return result.data;

  // Try with underscores
  const withUnderscores = companyName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (withUnderscores !== cleaned) {
    const result2 = await lookupByUsername(withUnderscores, token);
    if (result2.ok && result2.data) return result2.data;
  }

  return null;
}

async function getRecentTweets(userId, token) {
  const fields = 'created_at,public_metrics,text';
  const url = `${TWITTER_BASE}/users/${userId}/tweets?max_results=10&tweet.fields=${fields}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export async function research(companyName, hints = {}) {
  const token = getBearerToken();
  if (!token) {
    return { success: false, error: 'TWITTER_BEARER_TOKEN not configured', data: null, profile: null };
  }

  try {
    let user = null;

    if (hints.twitter_handle) {
      const handle = hints.twitter_handle.replace('@', '');
      const result = await lookupByUsername(handle, token);
      if (result.ok) user = result.data;
    }

    // Try company search
    if (!user) {
      user = await searchUser(companyName, token);
    }

    // Try person search if name provided
    let personUser = null;
    if (hints.name) {
      const personHandle = hints.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const personResult = await lookupByUsername(personHandle, token);
      if (personResult.ok && personResult.data) {
        personUser = personResult.data;
      }
    }

    if (!user && !personUser) {
      return {
        success: false,
        data: null,
        error: `Twitter account for "${companyName}" not found`,
        profile: null,
      };
    }

    // Prefer person account if found, fall back to company
    const primaryUser = personUser || user;
    const tweets = await getRecentTweets(primaryUser.id, token);

    const metrics = primaryUser.public_metrics || {};
    const data = {
      id: primaryUser.id,
      username: primaryUser.username,
      name: primaryUser.name,
      description: primaryUser.description,
      location: primaryUser.location,
      url: primaryUser.url,
      profile_image_url: primaryUser.profile_image_url,
      verified: primaryUser.verified,
      created_at: primaryUser.created_at,
      followers_count: metrics.followers_count,
      following_count: metrics.following_count,
      tweet_count: metrics.tweet_count,
      listed_count: metrics.listed_count,
      recent_tweets: tweets.slice(0, 5).map(t => ({
        text: t.text,
        created_at: t.created_at,
        likes: t.public_metrics?.like_count || 0,
        retweets: t.public_metrics?.retweet_count || 0,
        replies: t.public_metrics?.reply_count || 0,
      })),
    };

    // If we found both person and company, include company as secondary context
    if (personUser && user && personUser.id !== user.id) {
      data.company_account = {
        username: user.username,
        name: user.name,
        description: user.description,
        followers_count: user.public_metrics?.followers_count,
      };
    }

    return {
      success: true,
      data,
      error: null,
      profile: {
        platform: 'twitter',
        profile_url: `https://twitter.com/${primaryUser.username}`,
        username: primaryUser.username,
        display_name: primaryUser.name,
        bio: primaryUser.description || null,
        followers_count: metrics.followers_count || null,
      },
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Twitter research failed: ${err.message}`,
      profile: null,
    };
  }
}
