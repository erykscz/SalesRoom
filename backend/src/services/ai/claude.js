// Claude AI message generation service
// Direct fetch to Anthropic API (no SDK dependency)

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

const CHANNEL_CONFIG = {
  cold_email: { maxLength: 2000, hasSubject: true, label: 'Cold Email' },
  linkedin_inmail: { maxLength: 1900, hasSubject: true, label: 'LinkedIn InMail' },
  linkedin_connection: { maxLength: 300, hasSubject: false, label: 'LinkedIn Connection Request' },
  twitter_dm: { maxLength: 500, hasSubject: false, label: 'Twitter DM' },
  generic: { maxLength: 1500, hasSubject: false, label: 'Generic Message' },
};

const TONE_DESCRIPTIONS = {
  formal: 'Professional, polished, corporate tone. Use proper salutations and structured writing.',
  casual: 'Friendly, conversational, peer-to-peer tone. Write like a colleague, not a salesperson.',
  provocative: 'Challenging, thought-provoking, bold tone. Ask questions that challenge assumptions.',
  consultative: 'Helpful, insight-driven, advisory tone. Lead with industry knowledge and observations.',
};

function buildSystemPrompt(channel, tone, masterPrompt) {
  const channelConf = CHANNEL_CONFIG[channel];
  const masterInstructions = masterPrompt
    ? `\n\nAdditional instructions from the sales rep (ALWAYS follow these):\n${masterPrompt}`
    : '';
  return `You are an expert sales development representative crafting personalized outreach messages.
You write messages that are authentic, specific, and demonstrate genuine research about the prospect.
Your messages are directed to a SPECIFIC PERSON - always address them by name and reference their role, background, or interests when available.

Rules:
- Never be generic. Every message MUST reference specific details from the research data provided.
- Personalize for the individual: use their name, mention their job title or expertise, reference their professional background.
- Match the requested tone: ${TONE_DESCRIPTIONS[tone]}
- Channel: ${channelConf.label}
- Maximum message body length: ${channelConf.maxLength} characters. STRICTLY respect this limit.
${channelConf.hasSubject ? '- Include a compelling subject line (max 80 characters).' : '- No subject line needed.'}
- Include a clear, non-pushy call to action.
- Do NOT use salesy cliches, buzzwords, or generic phrases like "I hope this finds you well".
- Write in Polish.
- Output ONLY valid JSON, nothing else.${masterInstructions}`;
}

function buildUserPrompt(leadData, researchData, socialProfiles, channel, tone, additionalContext, knowledgeBase, styleExamples) {
  const sections = [];

  sections.push(`## Prospect Information
- Name: ${leadData.name || 'Unknown'}
- Job Title: ${leadData.job_title || 'Unknown'}
- Email: ${leadData.email || 'Unknown'}
- Company: ${leadData.company_name}
- Industry: ${leadData.industry || 'Unknown'}
- Tech Stack: ${leadData.tech_stack || 'Unknown'}
- Identified Pain: ${leadData.identified_pain || 'Not yet identified'}
- Notes: ${leadData.notes || 'None'}`);

  if (researchData) {
    if (researchData.linkedin_data) {
      try {
        const li = JSON.parse(researchData.linkedin_data);
        const company = li.company || li;
        sections.push(`## LinkedIn Research
- Description: ${company.description || 'N/A'}
- Industry: ${company.industry || 'N/A'}
- Company Size: ${company.company_size || 'N/A'}
- Headquarters: ${company.headquarters || 'N/A'}
- Specialities: ${(company.specialities || []).join(', ') || 'N/A'}`);
        if (li.person) {
          sections.push(`- Key Contact: ${li.person.full_name || 'N/A'} - ${li.person.headline || 'N/A'}
- Contact Skills: ${(li.person.skills || []).slice(0, 5).join(', ') || 'N/A'}`);
        }
      } catch (e) { /* ignore parse errors */ }
    }

    if (researchData.twitter_data) {
      try {
        const tw = JSON.parse(researchData.twitter_data);
        const recentTweets = (tw.recent_tweets || []).slice(0, 3).map(t => `  - "${t.text?.substring(0, 100)}"`).join('\n');
        sections.push(`## Twitter/X Research
- Handle: @${tw.username || 'N/A'}
- Bio: ${tw.description || 'N/A'}
- Followers: ${tw.followers_count || 'N/A'}
- Recent Activity:\n${recentTweets || '  None found'}`);
      } catch (e) { /* ignore */ }
    }

    if (researchData.github_data) {
      try {
        const gh = JSON.parse(researchData.github_data);
        const langs = (gh.languages || []).slice(0, 5).map(l => l.language).join(', ');
        const repos = (gh.top_repos || []).slice(0, 3).map(r => `  - ${r.name}: ${r.description || 'no description'} (${r.stars || 0} stars)`).join('\n');
        sections.push(`## GitHub Research
- Profile: ${gh.login || 'N/A'}
- Bio: ${gh.bio || 'N/A'}
- Public Repos: ${gh.public_repos || 'N/A'}
- Top Languages: ${langs || 'N/A'}
- Notable Repos:\n${repos || '  None found'}`);
      } catch (e) { /* ignore */ }
    }

    if (researchData.reddit_data) {
      try {
        const rd = JSON.parse(researchData.reddit_data);
        const mentions = (rd.mentions || []).slice(0, 3).map(m => `  - "${m.title}" in r/${m.subreddit}`).join('\n');
        sections.push(`## Reddit Research
- Mentions Found: ${rd.total_mentions_found || 0}
- Active Subreddits: ${(rd.top_subreddits_mentioned_in || []).map(s => `r/${s.name}`).join(', ') || 'N/A'}
- Recent Mentions:\n${mentions || '  None found'}`);
      } catch (e) { /* ignore */ }
    }

    if (researchData.facebook_data) {
      try {
        const fb = JSON.parse(researchData.facebook_data);
        sections.push(`## Facebook Research
- Page: ${fb.name || 'N/A'}
- Category: ${fb.category || 'N/A'}
- About: ${fb.about || fb.description || 'N/A'}
- Fans: ${fb.fan_count || 'N/A'}`);
      } catch (e) { /* ignore */ }
    }

    if (researchData.research_summary) {
      sections.push(`## AI Research Summary\n${researchData.research_summary}`);
    }
  }

  if (knowledgeBase && knowledgeBase.length > 0) {
    const kbEntries = knowledgeBase.map(kb => {
      const contentLimit = kb.type === 'document' ? 3000 : 1000;
      const content = (kb.content || '').substring(0, contentLimit);
      return `### [${kb.type || 'document'}] ${kb.title}\n${content}`;
    }).join('\n\n');
    sections.push(`## Company Knowledge Base (use these materials to enrich the message)\n${kbEntries}`);
  }

  if (styleExamples && styleExamples.length > 0) {
    const examples = styleExamples.map((ex, i) => {
      if (ex.is_edited && ex.original_message_body) {
        return `### Example ${i + 1} (User-edited — learn from the corrections)
**AI draft:**
${ex.original_subject_line ? `Subject: ${ex.original_subject_line}\n` : ''}${ex.original_message_body}

**User's preferred version:**
${ex.subject_line ? `Subject: ${ex.subject_line}\n` : ''}${ex.message_body}`;
      }
      return `### Example ${i + 1} (Favorited — user liked this style)
${ex.subject_line ? `Subject: ${ex.subject_line}\n` : ''}${ex.message_body}`;
    }).join('\n\n');
    sections.push(`## User's Preferred Writing Style
The user has provided examples of messages they prefer. Study these carefully and match the style, tone, structure, and phrasing patterns in your output.

${examples}`);
  }

  if (additionalContext) {
    sections.push(`## Additional Context from Sales Rep\n${additionalContext}`);
  }

  const channelConf = CHANNEL_CONFIG[channel];
  const outputFormat = channelConf.hasSubject
    ? `{ "subject_line": "...", "message_body": "...", "personalization_points": ["point1", "point2", "point3"] }`
    : `{ "message_body": "...", "personalization_points": ["point1", "point2", "point3"] }`;

  sections.push(`## Output Format
Return ONLY a JSON object with this structure:
${outputFormat}

The message_body must be under ${channelConf.maxLength} characters.`);

  return `Generate a ${channelConf.label} message with a ${tone} tone for the following prospect:\n\n${sections.join('\n\n')}`;
}

export async function generateMessage({ leadData, researchData, socialProfiles, channel, tone, additionalContext, knowledgeBase, masterPrompt, styleExamples }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const systemPrompt = buildSystemPrompt(channel, tone, masterPrompt);
  const userPrompt = buildUserPrompt(leadData, researchData, socialProfiles, channel, tone, additionalContext, knowledgeBase, styleExamples);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) {
    throw new Error('Empty response from Claude API');
  }

  // Parse JSON from response (Claude may wrap in markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse JSON from Claude response');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    subject_line: parsed.subject_line || null,
    message_body: parsed.message_body,
    personalization_points: parsed.personalization_points || [],
    prompt_used: userPrompt,
    model_used: MODEL,
  };
}
