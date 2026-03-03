// Reddit research via Apify
// Actor: trudax/reddit-scraper
// Replaces official Reddit API when APIFY_API_TOKEN is configured

import { runActorAndWaitForResults } from './client.js';

const ACTOR_ID = 'trudax~reddit-scraper';

export async function research(companyName, hints = {}) {
  try {
    const input = {
      searchTerms: [companyName],
      searchPosts: true,
      searchCommunities: true,
      maxItems: 15,
      sort: 'relevance',
    };

    const result = await runActorAndWaitForResults(ACTOR_ID, input, {
      timeoutMs: 120000,
      pollIntervalMs: 4000,
      maxItems: 25,
    });

    if (!result.success || result.items.length === 0) {
      return {
        success: false,
        data: null,
        error: result.error || `No Reddit data found for "${companyName}" via Apify`,
        profile: null,
      };
    }

    const items = result.items;

    // Separate posts from communities
    const posts = [];
    const communities = [];

    for (const item of items) {
      if (item.dataType === 'community' || item.type === 'community' || item.subscribers != null) {
        communities.push({
          name: item.displayName || item.name || item.title || '',
          title: item.title || item.displayName || '',
          subscribers: item.subscribers || item.numberOfMembers || 0,
          description: (item.publicDescription || item.description || '').substring(0, 200) || null,
          url: item.url || (item.displayName ? `https://www.reddit.com/r/${item.displayName}` : null),
        });
      } else {
        posts.push({
          title: item.title || '',
          subreddit: item.subredditName || item.communityName || item.subreddit || '',
          score: item.score || item.upVotes || 0,
          num_comments: item.numberOfComments || item.numComments || item.num_comments || 0,
          url: item.url || item.permalink || '',
          created_utc: item.createdAt || item.created_utc || null,
          selftext: (item.body || item.selftext || item.text || '').substring(0, 200) || null,
        });
      }
    }

    if (posts.length === 0 && communities.length === 0) {
      return {
        success: false,
        data: null,
        error: `No Reddit mentions found for "${companyName}" via Apify`,
        profile: null,
      };
    }

    // Analyze top subreddits
    const topSubreddits = {};
    for (const post of posts) {
      if (post.subreddit) {
        topSubreddits[post.subreddit] = (topSubreddits[post.subreddit] || 0) + 1;
      }
    }

    const data = {
      mentions: posts.slice(0, 10),
      related_subreddits: communities.slice(0, 5),
      top_subreddits_mentioned_in: Object.entries(topSubreddits)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, mention_count: count })),
      total_mentions_found: posts.length,
      _source: 'apify',
    };

    return {
      success: true,
      data,
      error: null,
      profile: {
        platform: 'reddit',
        profile_url: communities.length > 0 ? communities[0].url : null,
        username: companyName,
        display_name: companyName,
        bio: `${posts.length} mentions found across Reddit`,
        followers_count: communities.length > 0 ? communities[0].subscribers : null,
      },
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: `Reddit research via Apify failed: ${err.message}`,
      profile: null,
    };
  }
}
