import { v4 as uuidv4 } from 'uuid';
import { run, get, all } from '../../db/database.js';
import { research as linkedinResearch } from './linkedin.js';
import { research as githubResearch } from './github.js';
import { research as twitterResearch } from './twitter.js';
import { research as redditResearch } from './reddit.js';
import { research as facebookResearch } from './facebook.js';
import { research as websiteResearch } from './website.js';

// Conditionally load TinyFish adapters when configured
let tinyfishLinkedIn = null;
let tinyfishWebsite = null;
if (process.env.RESEARCH_PROVIDER === 'tinyfish' && process.env.TINYFISH_API_KEY) {
  try {
    const tfLi = await import('../tinyfish/linkedin.js');
    const tfWs = await import('../tinyfish/website.js');
    tinyfishLinkedIn = tfLi.research;
    tinyfishWebsite = tfWs.research;
    console.log('TinyFish adapters loaded for LinkedIn and website research');
  } catch (err) {
    console.error('Failed to load TinyFish adapters:', err.message);
  }
}

// Conditionally load Apify adapters when configured (replaces Twitter/Reddit/Facebook official APIs)
let apifyTwitter = null;
let apifyReddit = null;
let apifyFacebook = null;
if (process.env.APIFY_API_TOKEN) {
  try {
    const apTw = await import('../apify/twitter.js');
    const apRd = await import('../apify/reddit.js');
    const apFb = await import('../apify/facebook.js');
    apifyTwitter = apTw.research;
    apifyReddit = apRd.research;
    apifyFacebook = apFb.research;
    console.log('Apify adapters loaded for Twitter, Reddit, Facebook research');
  } catch (err) {
    console.error('Failed to load Apify adapters:', err.message);
  }
}

const platformAdapters = {
  linkedin: tinyfishLinkedIn || linkedinResearch,
  github: githubResearch,
  twitter: apifyTwitter || twitterResearch,
  reddit: apifyReddit || redditResearch,
  facebook: apifyFacebook || facebookResearch,
  website: tinyfishWebsite || websiteResearch,
};

// Determine which platforms have API keys configured
export function getAvailablePlatforms() {
  const available = [];
  available.push('linkedin'); // Works with Proxycurl API or public profile scraper + DuckDuckGo search
  available.push('github'); // GitHub works without token (lower rate limit)
  available.push('website'); // Company website scraper — no API key needed
  const hasApify = !!process.env.APIFY_API_TOKEN;
  if (hasApify || process.env.TWITTER_BEARER_TOKEN) available.push('twitter');
  if (hasApify || (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET)) available.push('reddit');
  if (hasApify || process.env.FACEBOOK_ACCESS_TOKEN) available.push('facebook');
  return available;
}

export async function executeResearch(researchProfileId, leadId, platforms, hints, userId, dealId = null) {
  try {
    // Update status to running
    await run(
      `UPDATE research_profiles SET status = 'running', platforms_searched = ?, updated_at = datetime('now') WHERE id = ?`,
      [JSON.stringify(platforms), researchProfileId]
    );

    // Fetch source data for context (lead or deal)
    let companyName;
    let personContext = {};
    const entityId = dealId || leadId;
    const entityType = dealId ? 'deal' : 'lead';

    if (dealId) {
      const deal = await get('SELECT * FROM deals WHERE id = ?', [dealId]);
      if (!deal) {
        await run(
          `UPDATE research_profiles SET status = 'failed', error_log = ?, updated_at = datetime('now') WHERE id = ?`,
          [JSON.stringify([{ platform: 'system', error: 'Deal not found' }]), researchProfileId]
        );
        return;
      }
      companyName = deal.company_name;
      personContext = {
        name: deal.name || null,
        job_title: deal.job_title || null,
        linkedin_url: deal.linkedin_url || null,
        company_url: deal.company_url || null,
      };
    } else {
      const lead = await get('SELECT * FROM leads WHERE id = ?', [leadId]);
      if (!lead) {
        await run(
          `UPDATE research_profiles SET status = 'failed', error_log = ?, updated_at = datetime('now') WHERE id = ?`,
          [JSON.stringify([{ platform: 'system', error: 'Lead not found' }]), researchProfileId]
        );
        return;
      }
      companyName = lead.company_name;
      personContext = {
        name: lead.name || null,
        job_title: lead.job_title || null,
        linkedin_url: lead.linkedin_url || null,
      };
    }

    // Merge person context into hints for adapters
    const enrichedHints = { ...hints };
    if (personContext.name) enrichedHints.name = personContext.name;
    if (personContext.linkedin_url && !enrichedHints.linkedin_person_url) {
      enrichedHints.linkedin_person_url = personContext.linkedin_url;
    }
    if (personContext.company_url && !enrichedHints.company_url) {
      enrichedHints.company_url = personContext.company_url;
    }

    // Check for existing Lix IT research data (pre-populated on import)
    let existingLixPersonData = null;
    if (dealId) {
      const existingProfile = await get(
        `SELECT linkedin_data FROM research_profiles
         WHERE deal_id = ? AND id != ? AND linkedin_data IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`,
        [dealId, researchProfileId]
      );
      if (existingProfile?.linkedin_data) {
        try {
          const parsed = JSON.parse(existingProfile.linkedin_data);
          if (parsed.person?._source === 'lix_import') {
            existingLixPersonData = parsed.person;
            console.log(`Found existing Lix IT person data for deal ${dealId} — will merge with new research`);
          }
        } catch { /* ignore parse errors */ }
      }
    }

    // Execute all platform adapters in parallel
    const results = await Promise.allSettled(
      platforms.map(async (platform) => {
        const adapter = platformAdapters[platform];
        if (!adapter) {
          return { platform, success: false, error: `Unknown platform: ${platform}`, data: null, profile: null };
        }
        const result = await adapter(companyName, enrichedHints);
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

        // Store social profile (wrapped in try/catch to prevent one platform's DB error from crashing all research)
        if (profile) {
          try {
            await run(
              `INSERT INTO social_profiles (id, lead_id, deal_id, research_profile_id, platform, profile_url, username, display_name, bio, followers_count, profile_data)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                uuidv4(), leadId || null, dealId || null, researchProfileId, profile.platform,
                profile.profile_url, profile.username, profile.display_name,
                profile.bio, profile.followers_count, JSON.stringify(data),
              ]
            );
          } catch (dbErr) {
            console.error(`Failed to store social profile for ${profile.platform}:`, dbErr.message);
          }
        }
      } else {
        errors.push({ platform, error: error || 'No data returned' });
      }
    }

    // Merge Lix IT person data with LinkedIn results if available
    if (existingLixPersonData && platformData.linkedin) {
      const li = platformData.linkedin;
      if (!li.person || li.person._source === 'url_only') {
        // Research couldn't get person data (e.g. HTTP 999) — use Lix IT data
        li.person = existingLixPersonData;
        console.log('Merged Lix IT person data into LinkedIn results (replaced url_only)');
      } else if (li.person) {
        // Research got some person data — fill gaps from Lix IT
        const lp = li.person;
        const lx = existingLixPersonData;
        if (!lp.summary && lx.summary) lp.summary = lx.summary;
        if (!lp.city && lx.city) lp.city = lx.city;
        if ((!lp.experiences || lp.experiences.length === 0) && lx.experiences?.length > 0) lp.experiences = lx.experiences;
        if ((!lp.education || lp.education.length === 0) && lx.education?.length > 0) lp.education = lx.education;
        if (lx.seniority) lp.seniority = lx.seniority;
        if (lx.job_function) lp.job_function = lx.job_function;
        console.log('Merged Lix IT person data into LinkedIn results (filled gaps)');
      }
    } else if (existingLixPersonData && !platformData.linkedin) {
      // LinkedIn adapter failed entirely but we have Lix IT data — add it
      platformData.linkedin = { company: null, person: existingLixPersonData };
      succeeded.push('linkedin');
      console.log('Added Lix IT person data as LinkedIn results (adapter had failed)');
    }

    // Determine final status
    const status = succeeded.length === platforms.length
      ? 'completed'
      : succeeded.length > 0
        ? 'partial'
        : 'failed';

    // Update research profile with results
    // Note: website data is stored in tavily_data column (repurposed — tavily is unused)
    await run(
      `UPDATE research_profiles SET
        status = ?,
        linkedin_data = ?,
        twitter_data = ?,
        github_data = ?,
        reddit_data = ?,
        facebook_data = ?,
        tavily_data = ?,
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
        platformData.website ? JSON.stringify(platformData.website) : null,
        JSON.stringify(succeeded),
        errors.length > 0 ? JSON.stringify(errors) : null,
        researchProfileId,
      ]
    );

    // Generate AI research summary if we have data and Claude is configured
    if (succeeded.length > 0 && process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
      try {
        const summary = await generateResearchSummary(companyName, platformData, personContext);
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

async function generateResearchSummary(companyName, platformData, personContext = {}) {
  const sections = [];

  // LinkedIn - include both company AND person data
  if (platformData.linkedin) {
    const li = platformData.linkedin;
    const company = li.company || li;
    sections.push(`LinkedIn Company: ${company.name || companyName} - ${company.industry || 'N/A'}, ${company.company_size || 'N/A'} employees. ${company.description ? company.description.substring(0, 300) : ''}`);

    // Include person data if available
    if (li.person) {
      const p = li.person;
      let personSection = `LinkedIn Person: ${p.full_name || personContext.name || 'N/A'}`;
      if (p.headline) personSection += ` - ${p.headline}`;
      if (p.summary) personSection += `. Summary: ${p.summary.substring(0, 300)}`;
      if (p.experiences && p.experiences.length > 0) {
        personSection += `. Current role: ${p.experiences[0].title} at ${p.experiences[0].company}`;
      }
      if (p.skills && p.skills.length > 0) {
        personSection += `. Skills: ${p.skills.slice(0, 5).join(', ')}`;
      }
      sections.push(personSection);
    }
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
  if (platformData.website) {
    const ws = platformData.website;
    let websiteSection = `Company Website (${ws.website || personContext.company_url || 'N/A'}): ${ws.name || companyName}`;
    if (ws.description) websiteSection += `. ${ws.description.substring(0, 300)}`;
    if (ws.industry) websiteSection += `. Industry: ${ws.industry}`;
    if (ws.keywords && ws.keywords.length > 0) websiteSection += `. Keywords: ${ws.keywords.slice(0, 5).join(', ')}`;
    if (ws.address) websiteSection += `. Address: ${ws.address}`;
    sections.push(websiteSection);
  } else if (personContext.company_url) {
    sections.push(`Company website: ${personContext.company_url}`);
  }

  const personName = personContext.name || null;
  const jobTitle = personContext.job_title || null;
  const subjectDesc = personName
    ? `${personName}${jobTitle ? ` (${jobTitle})` : ''} at ${companyName}`
    : companyName;

  const prompt = `Summarize the following research data about ${subjectDesc} in 3-5 sentences. Focus on what would be useful for a sales representative crafting personalized outreach${personName ? `, specifically targeting ${personName}` : ''}. Highlight personal interests, professional background, and any hooks for conversation. Write in Polish.\n\n${sections.join('\n\n')}`;

  // Try with primary model first, then fallback model if primary is unavailable
  const models = [
    process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    'claude-3-haiku-20240307', // fallback: cheaper, more available
  ];

  for (const model of models) {
    // Retry up to 2 times per model for transient errors
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 512,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          return data.content?.[0]?.text || null;
        }

        // Retryable errors: 429 (rate limit), 529 (overloaded), 500/502/503 (server errors)
        const retryable = [429, 500, 502, 503, 529];
        if (retryable.includes(res.status) && attempt < maxRetries) {
          const waitMs = attempt * 2000;
          console.log(`Anthropic API (${model}) returned ${res.status}, retrying in ${waitMs}ms (attempt ${attempt}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
          continue;
        }

        // Not retryable or last attempt — try next model
        console.log(`Anthropic API (${model}) returned ${res.status} after ${attempt} attempt(s), trying next model...`);
        break;
      } catch (err) {
        if (attempt < maxRetries) {
          const waitMs = attempt * 2000;
          console.log(`Anthropic API (${model}) error: ${err.message}, retrying in ${waitMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
          continue;
        }
        console.log(`Anthropic API (${model}) failed after ${attempt} attempt(s): ${err.message}, trying next model...`);
        break;
      }
    }
  }

  console.error('All Anthropic models failed for research summary generation');
  return null;
}
