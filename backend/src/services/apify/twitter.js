// Twitter/X research via Apify
// Actor: apidojo/tweet-scraper (Tweet Scraper V2)
// Replaces official Twitter API v2 when APIFY_API_TOKEN is configured

import { runActorAndWaitForResults } from './client.js';

const ACTOR_ID = 'apidojo~tweet-scraper';

export async function research(companyName, hints = {}) {
  try {
    // Build search terms
    const searchTerms = [];
    if (hints.twitter_handle) {
      const handle = hints.twitter_handle.replace('@', '');
      searchTerms.push(`from:${handle}`);
    }
    if (hints.name) {
      searchTerms.push(hints.name);
    }
    if (searchTerms.length === 0) {
      searchTerms.push(companyName);
    }

    // Calculate date 30 days ago
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const input = {
      searchTerms,
      maxItems: 20,
      sort: 'Latest',
      addUserInfo: true,
      startDate: startDate.toISOString().split('T')[0],
    };

    const result = await runActorAndWaitForResults(ACTOR_ID, input, {
      timeoutMs: 45000,
      pollIntervalMs: 3000,
      maxItems: 30,
    });

    if (!result.success || result.items.length === 0) {
      return {
        success: false,
        data: null,
        error: result.error || `No Twitter data found for "${companyName}" via Apify`,
        profile: null,
      };
    }

    // Extract user info from tweets
    const items = result.items;
    const userInfo = extractUserInfo(items, hints);

    // Map tweets to standard format
    const recentTweets = items.slice(0, 10).map(item => ({
      text: item.full_text || item.text || '',
      created_at: item.created_at || null,
      likes: item.favorite_count || item.likeCount || 0,
      retweets: item.retweet_count || item.retweetCount || 0,
      replies: item.reply_count || item.replyCount || 0,
    }));

    const data = {
      username: userInfo.username,
      name: userInfo.name,
      description: userInfo.description,
      location: userInfo.location,
      url: userInfo.url,
      profile_image_url: userInfo.profile_image_url,
      verified: userInfo.verified || false,
      created_at: userInfo.created_at,
      followers_count: userInfo.followers_count,
      following_count: userInfo.following_count,
      tweet_count: userInfo.tweet_count,
      listed_count: userInfo.listed_count,
      recent_tweets: recentTweets,
      _source: 'apify',
    };

    return {
      success: true,
      data,
      error: null,
      profile: {
        platform: 'twitter',
        profile_url: userInfo.username ? `https://twitter.com/${userInfo.username}` : null,
        username: userInfo.username,
        display_name: userInfo.name,
        bio: userInfo.description || null,
        followers_count: userInfo.followers_count || null,
      },
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Twitter research via Apify failed: ${err.message}`,
      profile: null,
    };
  }
}

/**
 * Check if a candidate name plausibly matches the target person.
 * Rejects partial matches like "Maciej W" when target is "Maciej Wierzbicki".
 */
function isPersonNameMatch(targetName, candidateName) {
  if (!targetName || !candidateName) return false;
  const normalize = s => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const target = normalize(targetName);
  const candidate = normalize(candidateName);
  if (target === candidate) return true;

  const targetParts = target.split(' ').filter(p => p.length >= 3);
  if (targetParts.length < 2) return false;

  return targetParts.every(part => candidate.includes(part));
}

/**
 * Extract primary user info from tweet results.
 * Apify tweet scraper includes user data in each tweet item.
 */
function extractUserInfo(items, hints) {
  // Try to find user matching the handle hint
  const targetHandle = hints.twitter_handle?.replace('@', '').toLowerCase();

  for (const item of items) {
    const user = item.author || item.user || {};
    const screenName = (user.screen_name || user.userName || user.username || '').toLowerCase();

    if (targetHandle && screenName === targetHandle) {
      return mapUser(user);
    }
  }

  // Build list of unique authors
  const authorCounts = {};
  for (const item of items) {
    const user = item.author || item.user || {};
    const screenName = user.screen_name || user.userName || user.username || '';
    if (screenName) {
      if (!authorCounts[screenName]) {
        authorCounts[screenName] = { count: 0, user };
      }
      authorCounts[screenName].count++;
    }
  }

  const sortedAuthors = Object.values(authorCounts).sort((a, b) => b.count - a.count);

  // If searching by person name, only accept an author whose display name matches
  if (hints.name && !targetHandle) {
    for (const entry of sortedAuthors) {
      const displayName = entry.user.name || entry.user.screen_name || '';
      if (isPersonNameMatch(hints.name, displayName)) {
        return mapUser(entry.user);
      }
    }
    // No author name matches the target person — return empty rather than wrong person
    return { username: null, name: null, description: null, followers_count: null };
  }

  // Fallback (company-name search) — use most common author
  const topAuthor = sortedAuthors[0];
  if (topAuthor) {
    return mapUser(topAuthor.user);
  }

  return { username: null, name: null, description: null, followers_count: null };
}

function mapUser(user) {
  return {
    username: user.screen_name || user.userName || user.username || null,
    name: user.name || null,
    description: user.description || user.rawDescription || null,
    location: user.location || null,
    url: user.url || null,
    profile_image_url: user.profile_image_url_https || user.profileImageUrl || null,
    verified: user.verified || user.isVerified || false,
    created_at: user.created_at || null,
    followers_count: user.followers_count || user.followersCount || null,
    following_count: user.friends_count || user.followingCount || null,
    tweet_count: user.statuses_count || user.statusesCount || null,
    listed_count: user.listed_count || user.listedCount || null,
  };
}
