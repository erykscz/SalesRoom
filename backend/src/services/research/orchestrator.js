import { v4 as uuidv4 } from 'uuid';
import { run, get, all } from '../../db/database.js';
import { research as linkedinResearch } from './linkedin.js';
import { research as githubResearch } from './github.js';
import { research as twitterResearch } from './twitter.js';
import { research as redditResearch } from './reddit.js';
import { research as facebookResearch } from './facebook.js';

const platformAdapters = {
  linkedin: linkedinResearch,
  github: githubResearch,
  twitter: twitterResearch,
  reddit: redditResearch,
  facebook: facebookResearch,
};

// Determine which platforms have API keys configured
export function getAvailablePlatforms() {
  const available = [];
  if (process.env.PROXYCURL_API_KEY) available.push('linkedin');
  available.push('github'); // GitHub works without token (lower rate limit)
  if (process.env.TWITTER_BEARER_TOKEN) available.push('twitter');
  if (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) available.push('reddit');
  // Reddit also works without auth via public JSON, so always include it
  if (!available.includes('reddit')) available.push('reddit');
  if (process.env.FACEBOOK_ACCESS_TOKEN) available.push('facebook');
  return available;
}

export async function executeResearch(researchProfileId, leadId, platforms, hints, userId) {
  try {
    // Update status to running
    await run(
      `UPDATE research_profiles SET status = 'running', platforms_searched = ?, updated_at = datetime('now') WHERE id = ?`,
      [JSON.stringify(platforms), researchProfileId]
    );

    // Fetch lead data for context
    const lead = await get('SELECT * FROM leads WHERE id = ?', [leadId]);
    if (!lead) {
      await run(
        `UPDATE research_profiles SET status = 'failed', error_log = ?, updated_at = datetime('now') WHERE id = ?`,
        [JSON.stringify([{ platform: 'system', error: 'Lead not found' }]), researchProfileId]
      );
      return;
    }

    const companyName = lead.company_name;

    // Execute all platform adapters in parallel
    const results = await Promise.allSettled(
      platforms.map(async (platform) => {
        const adapter = platformAdapters[platform];
        if (!adapter) {
          return { platform, success: false, error: `Unknown platform: ${platform}`, data: null, profile: null };
        }
        const result = await adapter(companyName, hints);
        return { platform, ...result };
      })
    );

    // Process results
    const succeeded = [];
    const errors = [];
    const platformData = {};

    for (const result of results) {
      if (result.status === 'rejected') {
        errors.push({ platform: 'unknown', error: result.reason?.message || 'Unexpected error' });
        continue;
      }

      const { platform, success, data, error, profile } = result.value;

      if (success && data) {
        succeeded.push(platform);
        platformData[platform] = data;

        // Store social profile
        if (profile) {
          await run(
            `INSERT INTO social_profiles (id, lead_id, research_profile_id, platform, profile_url, username, display_name, bio, followers_count, profile_data)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              uuidv4(), leadId, researchProfileId, profile.platform,
              profile.profile_url, profile.username, profile.display_name,
              profile.bio, profile.followers_count, JSON.stringify(data),
            ]
          );
        }
      } else {
        errors.push({ platform, error: error || 'No data returned' });
      }
    }

    // Determine final status
    const status = succeeded.length === platforms.length
      ? 'completed'
      : succeeded.length > 0
        ? 'partial'
        : 'failed';

    // Update research profile with results
    await run(
      `UPDATE research_profiles SET
        status = ?,
        linkedin_data = ?,
        twitter_data = ?,
        github_data = ?,
        reddit_data = ?,
        facebook_data = ?,
        platforms_succeeded = ?,
        error_log = ?,
        updated_at = datetime('now'),
        completed_at = datetime('now')
      WHERE id = ?`,
      [
        status,
        platformData.linkedin ? JSON.stringify(platformData.linkedin) : null,
        platformData.twitter ? JSON.stringify(platformData.twitter) : null,
        platformData.github ? JSON.stringify(platformData.github) : null,
        platformData.reddit ? JSON.stringify(platformData.reddit) : null,
        platformData.facebook ? JSON.stringify(platformData.facebook) : null,
        JSON.stringify(succeeded),
        errors.length > 0 ? JSON.stringify(errors) : null,
        researchProfileId,
      ]
    );

    // Generate AI research summary if we have data and Claude is configured
    if (succeeded.length > 0 && process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
      try {
        const summary = await generateResearchSummary(companyName, platformData);
        if (summary) {
          await run(
            `UPDATE research_profiles SET research_summary = ?, updated_at = datetime('now') WHERE id = ?`,
            [summary, researchProfileId]
          );
        }
      } catch (err) {
        console.error('Failed to generate research summary:', err.message);
      }
    }

  } catch (err) {
    console.error('Research execution error:', err);
    await run(
      `UPDATE research_profiles SET status = 'failed', error_log = ?, updated_at = datetime('now') WHERE id = ?`,
      [JSON.stringify([{ platform: 'system', error: err.message }]), researchProfileId]
    ).catch(() => {});
  }
}

async function generateResearchSummary(companyName, platformData) {
  const sections = [];
  if (platformData.linkedin) {
    const li = platformData.linkedin;
    const company = li.company || li;
    sections.push(`LinkedIn: ${company.name || companyName} - ${company.industry || 'N/A'}, ${company.company_size || 'N/A'} employees. ${company.description ? company.description.substring(0, 300) : ''}`);
  }
  if (platformData.github) {
    const gh = platformData.github;
    sections.push(`GitHub: ${gh.public_repos || 0} public repos. Top languages: ${(gh.languages || []).slice(0, 3).map(l => l.language).join(', ') || 'N/A'}`);
  }
  if (platformData.twitter) {
    const tw = platformData.twitter;
    sections.push(`Twitter: @${tw.username} - ${tw.followers_count || 0} followers. ${tw.description || ''}`);
  }
  if (platformData.reddit) {
    const rd = platformData.reddit;
    sections.push(`Reddit: ${rd.total_mentions_found || 0} mentions found.`);
  }
  if (platformData.facebook) {
    const fb = platformData.facebook;
    sections.push(`Facebook: ${fb.name || companyName} - ${fb.fan_count || 0} fans. ${fb.category || ''}`);
  }

  const prompt = `Summarize the following research data about "${companyName}" in 3-5 sentences. Focus on what would be useful for a sales representative crafting personalized outreach. Write in English.\n\n${sections.join('\n\n')}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.content?.[0]?.text || null;
}
