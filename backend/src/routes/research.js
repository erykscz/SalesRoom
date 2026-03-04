import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { run, get, all } from '../db/database.js';
import { executeResearch, getAvailablePlatforms } from '../services/research/orchestrator.js';
import { generateMessage } from '../services/ai/claude.js';

// On Vercel serverless, waitUntil() keeps the function alive after sending the response.
// Without it, fire-and-forget background tasks (like executeResearch) are killed immediately.
let waitUntil = null;
if (process.env.VERCEL) {
  try {
    const mod = await import('@vercel/functions');
    waitUntil = mod.waitUntil;
  } catch { /* not on Vercel or package not available */ }
}

const router = express.Router();

// Helper: parse research profile JSON fields
function parseResearchProfile(research) {
  if (!research) return null;
  return {
    ...research,
    linkedin_data: research.linkedin_data ? JSON.parse(research.linkedin_data) : null,
    twitter_data: research.twitter_data ? JSON.parse(research.twitter_data) : null,
    github_data: research.github_data ? JSON.parse(research.github_data) : null,
    reddit_data: research.reddit_data ? JSON.parse(research.reddit_data) : null,
    facebook_data: research.facebook_data ? JSON.parse(research.facebook_data) : null,
    website_data: research.tavily_data ? JSON.parse(research.tavily_data) : null,
    suggested_next_steps: research.suggested_next_steps
      ? JSON.parse(research.suggested_next_steps)
      : null,
    platforms_searched: JSON.parse(research.platforms_searched || '[]'),
    platforms_succeeded: JSON.parse(research.platforms_succeeded || '[]'),
    error_log: JSON.parse(research.error_log || '[]'),
  };
}

// Helper: parse social profiles
function parseSocialProfiles(profiles) {
  return profiles.map(sp => ({
    ...sp,
    profile_data: sp.profile_data ? JSON.parse(sp.profile_data) : null,
  }));
}

// GET /api/research/platforms - List available platforms (those with API keys configured)
router.get('/platforms', (req, res) => {
  const platforms = getAvailablePlatforms();
  res.json({ platforms });
});

// ============================================================================
// DEAL RESEARCH ENDPOINTS (must be before :leadId to avoid route conflicts)
// ============================================================================

// POST /api/research/deal/:dealId/start - Start deep research for a deal
router.post('/deal/:dealId/start', async (req, res) => {
  try {
    const { dealId } = req.params;
    const userId = req.user.id;
    const { platforms, linkedin_url, twitter_handle, github_username, facebook_page_id, company_url } = req.body;

    const deal = await get('SELECT * FROM deals WHERE id = ?', [dealId]);
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const available = getAvailablePlatforms();
    const selectedPlatforms = platforms && platforms.length > 0
      ? platforms.filter(p => available.includes(p))
      : available;

    if (selectedPlatforms.length === 0) {
      return res.status(400).json({ error: 'No platforms available. Configure API keys in environment variables.' });
    }

    const researchId = uuidv4();
    await run(
      `INSERT INTO research_profiles (id, lead_id, deal_id, status, platforms_searched, requested_by)
       VALUES (?, NULL, ?, 'pending', ?, ?)`,
      [researchId, dealId, JSON.stringify(selectedPlatforms), userId]
    );

    const hints = {};
    if (linkedin_url) hints.linkedin_person_url = linkedin_url;
    if (twitter_handle) hints.twitter_handle = twitter_handle;
    if (github_username) hints.github_username = github_username;
    if (facebook_page_id) hints.facebook_page_id = facebook_page_id;
    if (company_url) hints.company_url = company_url;

    // Add person hints from deal (form hints take priority)
    if (deal.name) hints.name = deal.name;
    if (deal.linkedin_url && !hints.linkedin_person_url) hints.linkedin_person_url = deal.linkedin_url;
    if (deal.company_url && !hints.company_url) hints.company_url = deal.company_url;

    // Fire-and-forget: start research in background.
    // On Vercel, waitUntil() keeps the function alive until the promise resolves.
    const researchPromise = executeResearch(researchId, null, selectedPlatforms, hints, userId, dealId);
    if (waitUntil) waitUntil(researchPromise);

    res.json({
      id: researchId,
      status: 'pending',
      platforms: selectedPlatforms,
      message: 'Research started. Poll /deal/:dealId/status for progress.',
    });
  } catch (error) {
    console.error('Error starting deal research:', error);
    res.status(500).json({ error: 'Failed to start research' });
  }
});

// GET /api/research/deal/:dealId/status - Lightweight status polling for deal
router.get('/deal/:dealId/status', async (req, res) => {
  try {
    const { dealId } = req.params;
    const profile = await get(
      'SELECT id, status, platforms_searched, platforms_succeeded, error_log, created_at, completed_at FROM research_profiles WHERE deal_id = ? ORDER BY created_at DESC LIMIT 1',
      [dealId]
    );

    if (!profile) {
      return res.json({ status: 'none', message: 'No research found for this deal' });
    }

    // Stale detection: if running for more than 90s, auto-fail
    if (profile.status === 'running' || profile.status === 'pending') {
      const createdAt = new Date(profile.created_at).getTime();
      const elapsed = Date.now() - createdAt;
      if (elapsed > 90000) {
        await run(
          `UPDATE research_profiles SET status = 'failed', error_log = ?, updated_at = datetime('now'), completed_at = datetime('now') WHERE id = ?`,
          [JSON.stringify([{ platform: 'system', error: 'Research timed out (exceeded 90s)' }]), profile.id]
        );
        profile.status = 'failed';
        profile.error_log = JSON.stringify([{ platform: 'system', error: 'Research timed out (exceeded 90s)' }]);
      }
    }

    res.json({
      id: profile.id,
      status: profile.status,
      platforms_searched: JSON.parse(profile.platforms_searched || '[]'),
      platforms_succeeded: JSON.parse(profile.platforms_succeeded || '[]'),
      errors: JSON.parse(profile.error_log || '[]'),
      created_at: profile.created_at,
      completed_at: profile.completed_at,
    });
  } catch (error) {
    console.error('Error fetching deal research status:', error);
    res.status(500).json({ error: 'Failed to fetch research status' });
  }
});

// GET /api/research/deal/:dealId - Full research results for deal
router.get('/deal/:dealId', async (req, res) => {
  try {
    const { dealId } = req.params;

    const research = await get(
      'SELECT * FROM research_profiles WHERE deal_id = ? ORDER BY created_at DESC LIMIT 1',
      [dealId]
    );

    if (!research) {
      return res.json({ research: null, socialProfiles: [], messages: [] });
    }

    const socialProfiles = await all(
      'SELECT * FROM social_profiles WHERE deal_id = ? ORDER BY platform',
      [dealId]
    );

    const messages = await all(
      'SELECT * FROM generated_messages WHERE deal_id = ? ORDER BY created_at DESC',
      [dealId]
    );

    res.json({
      research: parseResearchProfile(research),
      socialProfiles: parseSocialProfiles(socialProfiles),
      messages,
    });
  } catch (error) {
    console.error('Error fetching deal research results:', error);
    res.status(500).json({ error: 'Failed to fetch research results' });
  }
});

// POST /api/research/deal/:dealId/generate-message - Generate AI message for deal
router.post('/deal/:dealId/generate-message', async (req, res) => {
  try {
    const { dealId } = req.params;
    const userId = req.user.id;
    const { channel, tone, additional_context } = req.body;

    const validChannels = ['cold_email', 'linkedin_inmail', 'linkedin_connection', 'twitter_dm', 'generic'];
    const validTones = ['formal', 'casual', 'provocative', 'consultative'];

    if (!channel || !validChannels.includes(channel)) {
      return res.status(400).json({ error: `Invalid channel. Must be one of: ${validChannels.join(', ')}` });
    }
    if (!tone || !validTones.includes(tone)) {
      return res.status(400).json({ error: `Invalid tone. Must be one of: ${validTones.join(', ')}` });
    }

    const deal = await get('SELECT * FROM deals WHERE id = ?', [dealId]);
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const research = await get(
      'SELECT * FROM research_profiles WHERE deal_id = ? ORDER BY created_at DESC LIMIT 1',
      [dealId]
    );

    const socialProfiles = await all(
      'SELECT * FROM social_profiles WHERE deal_id = ?',
      [dealId]
    );

    // Map deal data to leadData format expected by Claude service
    const leadData = {
      name: deal.name || null,
      job_title: deal.job_title || null,
      email: deal.email || null,
      company_name: deal.company_name,
      company_url: deal.company_url || null,
      industry: deal.industry,
      tech_stack: null,
      identified_pain: null,
      notes: deal.next_step_description,
    };

    // Fetch Knowledge Base materials for context (only current user's items)
    const kbItems = await all(
      `SELECT title, content, type FROM knowledge_base WHERE created_by = ? ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );

    // Fetch user's AI Master Prompt
    const userRecord = await get('SELECT master_prompt FROM users WHERE id = ?', [userId]);

    const result = await generateMessage({
      leadData,
      researchData: research,
      socialProfiles,
      channel,
      tone,
      additionalContext: additional_context,
      knowledgeBase: kbItems,
      masterPrompt: userRecord?.master_prompt || null,
    });

    const messageId = uuidv4();
    await run(
      `INSERT INTO generated_messages (id, lead_id, deal_id, research_profile_id, channel, tone, subject_line, message_body, message_length, prompt_used, model_used, generated_by)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        messageId, dealId,
        research ? research.id : null,
        channel, tone,
        result.subject_line,
        result.message_body,
        result.message_body.length,
        result.prompt_used,
        result.model_used,
        userId,
      ]
    );

    res.json({
      id: messageId,
      channel,
      tone,
      subject_line: result.subject_line,
      message_body: result.message_body,
      message_length: result.message_body.length,
      personalization_points: result.personalization_points,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating deal message:', error);
    res.status(500).json({ error: `Failed to generate message: ${error.message}` });
  }
});

// ============================================================================
// LEAD RESEARCH ENDPOINTS (existing)
// ============================================================================

// POST /api/research/:leadId/start - Start deep research for a lead
router.post('/:leadId/start', async (req, res) => {
  try {
    const { leadId } = req.params;
    const userId = req.user.id;
    const { platforms, linkedin_url, twitter_handle, github_username, facebook_page_id } = req.body;

    const lead = await get('SELECT * FROM leads WHERE id = ?', [leadId]);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const available = getAvailablePlatforms();
    const selectedPlatforms = platforms && platforms.length > 0
      ? platforms.filter(p => available.includes(p))
      : available;

    if (selectedPlatforms.length === 0) {
      return res.status(400).json({ error: 'No platforms available. Configure API keys in environment variables.' });
    }

    const researchId = uuidv4();
    await run(
      `INSERT INTO research_profiles (id, lead_id, status, platforms_searched, requested_by)
       VALUES (?, ?, 'pending', ?, ?)`,
      [researchId, leadId, JSON.stringify(selectedPlatforms), userId]
    );

    const hints = {};
    if (linkedin_url) hints.linkedin_person_url = linkedin_url;
    if (twitter_handle) hints.twitter_handle = twitter_handle;
    if (github_username) hints.github_username = github_username;
    if (facebook_page_id) hints.facebook_page_id = facebook_page_id;

    // Add person hints from lead (form hints take priority)
    if (lead.name) hints.name = lead.name;
    if (lead.linkedin_url && !hints.linkedin_person_url) hints.linkedin_person_url = lead.linkedin_url;
    if (lead.company_website && !hints.company_url) hints.company_url = lead.company_website;

    // Fire-and-forget: start research in background.
    // On Vercel, waitUntil() keeps the function alive until the promise resolves.
    const researchPromise = executeResearch(researchId, leadId, selectedPlatforms, hints, userId);
    if (waitUntil) waitUntil(researchPromise);

    res.json({
      id: researchId,
      status: 'pending',
      platforms: selectedPlatforms,
      message: 'Research started. Poll /status for progress.',
    });
  } catch (error) {
    console.error('Error starting research:', error);
    res.status(500).json({ error: 'Failed to start research' });
  }
});

// GET /api/research/:leadId/status - Lightweight status polling
router.get('/:leadId/status', async (req, res) => {
  try {
    const { leadId } = req.params;
    const profile = await get(
      'SELECT id, status, platforms_searched, platforms_succeeded, error_log, created_at, completed_at FROM research_profiles WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1',
      [leadId]
    );

    if (!profile) {
      return res.json({ status: 'none', message: 'No research found for this lead' });
    }

    // Stale detection: if running for more than 90s, auto-fail
    if (profile.status === 'running' || profile.status === 'pending') {
      const createdAt = new Date(profile.created_at).getTime();
      const elapsed = Date.now() - createdAt;
      if (elapsed > 90000) {
        await run(
          `UPDATE research_profiles SET status = 'failed', error_log = ?, updated_at = datetime('now'), completed_at = datetime('now') WHERE id = ?`,
          [JSON.stringify([{ platform: 'system', error: 'Research timed out (exceeded 90s)' }]), profile.id]
        );
        profile.status = 'failed';
        profile.error_log = JSON.stringify([{ platform: 'system', error: 'Research timed out (exceeded 90s)' }]);
      }
    }

    res.json({
      id: profile.id,
      status: profile.status,
      platforms_searched: JSON.parse(profile.platforms_searched || '[]'),
      platforms_succeeded: JSON.parse(profile.platforms_succeeded || '[]'),
      errors: JSON.parse(profile.error_log || '[]'),
      created_at: profile.created_at,
      completed_at: profile.completed_at,
    });
  } catch (error) {
    console.error('Error fetching research status:', error);
    res.status(500).json({ error: 'Failed to fetch research status' });
  }
});

// GET /api/research/:leadId - Full research results
router.get('/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;

    const research = await get(
      'SELECT * FROM research_profiles WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1',
      [leadId]
    );

    const socialProfiles = await all(
      'SELECT * FROM social_profiles WHERE lead_id = ? ORDER BY platform',
      [leadId]
    );

    const messages = await all(
      'SELECT * FROM generated_messages WHERE lead_id = ? ORDER BY created_at DESC',
      [leadId]
    );

    res.json({
      research: parseResearchProfile(research),
      socialProfiles: parseSocialProfiles(socialProfiles),
      messages,
    });
  } catch (error) {
    console.error('Error fetching research results:', error);
    res.status(500).json({ error: 'Failed to fetch research results' });
  }
});

// POST /api/research/:leadId/generate-message - Generate AI outreach message
router.post('/:leadId/generate-message', async (req, res) => {
  try {
    const { leadId } = req.params;
    const userId = req.user.id;
    const { channel, tone, additional_context } = req.body;

    const validChannels = ['cold_email', 'linkedin_inmail', 'linkedin_connection', 'twitter_dm', 'generic'];
    const validTones = ['formal', 'casual', 'provocative', 'consultative'];

    if (!channel || !validChannels.includes(channel)) {
      return res.status(400).json({ error: `Invalid channel. Must be one of: ${validChannels.join(', ')}` });
    }
    if (!tone || !validTones.includes(tone)) {
      return res.status(400).json({ error: `Invalid tone. Must be one of: ${validTones.join(', ')}` });
    }

    const lead = await get('SELECT * FROM leads WHERE id = ?', [leadId]);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const research = await get(
      'SELECT * FROM research_profiles WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1',
      [leadId]
    );

    const socialProfiles = await all(
      'SELECT * FROM social_profiles WHERE lead_id = ?',
      [leadId]
    );

    const leadData = {
      name: lead.name || null,
      job_title: lead.job_title || null,
      email: lead.email || null,
      company_name: lead.company_name,
      industry: lead.industry,
      tech_stack: lead.tech_stack,
      identified_pain: lead.identified_pain,
      notes: lead.notes,
    };

    // Fetch Knowledge Base materials for context (only current user's items)
    const kbItems = await all(
      `SELECT title, content, type FROM knowledge_base WHERE created_by = ? ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );

    // Fetch user's AI Master Prompt
    const userRecord = await get('SELECT master_prompt FROM users WHERE id = ?', [userId]);

    const result = await generateMessage({
      leadData,
      researchData: research,
      socialProfiles,
      channel,
      tone,
      additionalContext: additional_context,
      knowledgeBase: kbItems,
      masterPrompt: userRecord?.master_prompt || null,
    });

    const messageId = uuidv4();
    await run(
      `INSERT INTO generated_messages (id, lead_id, research_profile_id, channel, tone, subject_line, message_body, message_length, prompt_used, model_used, generated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        messageId, leadId,
        research ? research.id : null,
        channel, tone,
        result.subject_line,
        result.message_body,
        result.message_body.length,
        result.prompt_used,
        result.model_used,
        userId,
      ]
    );

    res.json({
      id: messageId,
      channel,
      tone,
      subject_line: result.subject_line,
      message_body: result.message_body,
      message_length: result.message_body.length,
      personalization_points: result.personalization_points,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error generating message:', error);
    res.status(500).json({ error: `Failed to generate message: ${error.message}` });
  }
});

// GET /api/research/:leadId/messages - List generated messages
router.get('/:leadId/messages', async (req, res) => {
  try {
    const { leadId } = req.params;
    const messages = await all(
      'SELECT * FROM generated_messages WHERE lead_id = ? ORDER BY created_at DESC',
      [leadId]
    );
    res.json({ messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ============================================================================
// SHARED ENDPOINTS (work for both leads and deals)
// ============================================================================

// DELETE /api/research/profiles/:profileId - Delete a social profile
router.delete('/profiles/:profileId', async (req, res) => {
  try {
    const { profileId } = req.params;

    const profile = await get('SELECT * FROM social_profiles WHERE id = ?', [profileId]);
    if (!profile) {
      return res.status(404).json({ error: 'Social profile not found' });
    }

    await run('DELETE FROM social_profiles WHERE id = ?', [profileId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting social profile:', error);
    res.status(500).json({ error: 'Failed to delete social profile' });
  }
});

// DELETE /api/research/messages/:messageId - Delete a message
router.delete('/messages/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await get('SELECT * FROM generated_messages WHERE id = ?', [messageId]);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (message.generated_by !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }

    await run('DELETE FROM generated_messages WHERE id = ?', [messageId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// POST /api/research/messages/:messageId/favorite - Toggle favorite
router.post('/messages/:messageId/favorite', async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await get('SELECT * FROM generated_messages WHERE id = ?', [messageId]);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const newFavorite = message.is_favorite ? 0 : 1;
    await run('UPDATE generated_messages SET is_favorite = ? WHERE id = ?', [newFavorite, messageId]);

    res.json({ id: messageId, is_favorite: newFavorite === 1 });
  } catch (error) {
    console.error('Error toggling favorite:', error);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

export default router;
