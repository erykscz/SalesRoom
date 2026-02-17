import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db, { run, get, all } from '../db/database.js';

const router = express.Router();

// In-memory search status tracking (in production, use a job queue like Bull)
const searchJobs = new Map();

// List all searches for the current user
router.get('/searches', async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const isManager = req.user.role === 'manager';

    let query = `
      SELECT s.*, u.name as owner_name,
        (SELECT COUNT(*) FROM leads WHERE search_id = s.id) as results_count
      FROM intent_searches s
      LEFT JOIN users u ON s.owner_id = u.id
    `;

    if (!isAdmin && !isManager) {
      query += ` WHERE s.owner_id = ?`;
    }
    query += ` ORDER BY s.created_at DESC`;

    const searches = isAdmin || isManager
      ? await all(query)
      : await all(query, [userId]);

    // Handle null/empty results
    if (!searches || !Array.isArray(searches) || searches.length === 0) {
      return res.json({ searches: [] });
    }

    // Merge in-memory status for running jobs
    const enrichedSearches = [];
    for (const search of searches) {
      if (!search) continue;
      const jobStatus = searchJobs.get(search.id);
      if (jobStatus) {
        enrichedSearches.push({ ...search, status: jobStatus.status });
      } else {
        enrichedSearches.push(search);
      }
    }

    res.json({ searches: enrichedSearches });
  } catch (error) {
    console.error('Error fetching searches:', error);
    res.status(500).json({ error: 'Failed to fetch searches' });
  }
});

// Get search by ID with results
router.get('/searches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const isManager = req.user.role === 'manager';

    const search = await get(`
      SELECT s.*, u.name as owner_name
      FROM intent_searches s
      LEFT JOIN users u ON s.owner_id = u.id
      WHERE s.id = ?
    `, [id]);

    if (!search) {
      return res.status(404).json({ error: 'Search not found' });
    }

    // Check access
    if (!isAdmin && !isManager && search.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get in-memory status if available
    const jobStatus = searchJobs.get(id);
    if (jobStatus) {
      search.status = jobStatus.status;
    }

    // Get leads from this search
    const leads = await all(`
      SELECT l.*, u.name as owner_name
      FROM leads l
      LEFT JOIN users u ON l.owner_id = u.id
      WHERE l.search_id = ?
      ORDER BY l.confidence_score DESC
    `, [id]);

    res.json({ search, leads });
  } catch (error) {
    console.error('Error fetching search:', error);
    res.status(500).json({ error: 'Failed to fetch search' });
  }
});

// Start a new search
router.post('/search', async (req, res) => {
  try {
    const userId = req.user.id;
    const { mission_objective, icp_template_id } = req.body;

    if (!mission_objective || mission_objective.trim().length === 0) {
      return res.status(400).json({ error: 'Mission objective is required' });
    }

    const searchId = uuidv4();
    const now = new Date().toISOString();

    // Create search record
    await run(`
      INSERT INTO intent_searches (id, mission_objective, icp_template_id, status, owner_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [searchId, mission_objective.trim(), icp_template_id || null, 'queued', userId, now]);

    // Store job status in memory
    searchJobs.set(searchId, {
      status: 'queued',
      startedAt: now
    });

    // Simulate async search execution
    executeSearch(searchId, mission_objective, icp_template_id, userId);

    res.status(201).json({
      id: searchId,
      status: 'queued',
      message: 'Search started. Results will be available shortly.'
    });
  } catch (error) {
    console.error('Error starting search:', error);
    res.status(500).json({ error: 'Failed to start search' });
  }
});

// Search for leads using Tavily API
async function executeSearch(searchId, missionObjective, icpTemplateId, userId) {
  try {
    // Check for Tavily API key
    const tavilyApiKey = process.env.TAVILY_API_KEY;
    if (!tavilyApiKey || tavilyApiKey === 'your_tavily_key_here') {
      throw new Error('TAVILY_API_KEY not configured. Please set it in .env file.');
    }

    // Update status to running
    searchJobs.set(searchId, { status: 'running' });
    await run('UPDATE intent_searches SET status = ? WHERE id = ?', ['running', searchId]);

    // Get ICP criteria if template provided
    let icpCriteria = null;
    if (icpTemplateId) {
      const template = await get('SELECT criteria FROM icp_templates WHERE id = ?', [icpTemplateId]);
      if (template) {
        try {
          icpCriteria = JSON.parse(template.criteria);
        } catch (e) {
          console.error('Error parsing ICP criteria:', e);
        }
      }
    }

    // Build search query from mission objective and ICP criteria
    let searchQuery = `companies ${missionObjective}`;
    if (icpCriteria) {
      if (icpCriteria.industries?.length > 0) {
        searchQuery += ` industry:${icpCriteria.industries.join(' OR ')}`;
      }
      if (icpCriteria.company_size) {
        searchQuery += ` ${icpCriteria.company_size} employees`;
      }
    }

    console.log(`Searching Tavily for: ${searchQuery}`);

    // Call Tavily API
    const tavilyResponse = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query: searchQuery,
        search_depth: 'advanced',
        include_answer: true,
        include_domains: [],
        exclude_domains: [],
        max_results: 10
      })
    });

    if (!tavilyResponse.ok) {
      const errorText = await tavilyResponse.text();
      throw new Error(`Tavily API error: ${tavilyResponse.status} - ${errorText}`);
    }

    const tavilyData = await tavilyResponse.json();
    console.log(`Tavily returned ${tavilyData.results?.length || 0} results`);

    // Parse Tavily results into leads
    const results = parseSearchResults(tavilyData.results || [], missionObjective, icpCriteria);

    // Insert leads into database
    const now = new Date().toISOString();
    for (const result of results) {
      const leadId = uuidv4();
      const hookSuggestions = generateHookSuggestions(result.company_name, result.industry, result.identified_pain, result.tech_stack);
      const competitorInfo = generateCompetitorInfo(result.industry, result.tech_stack);

      await run(`
        INSERT INTO leads (id, company_name, industry, tech_stack, identified_pain, confidence_score, source_link, status, search_id, owner_id, hook_suggestions, competitor_info, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        leadId,
        result.company_name,
        result.industry,
        JSON.stringify(result.tech_stack || []),
        result.identified_pain,
        result.confidence_score,
        result.source_link,
        'new',
        searchId,
        userId,
        JSON.stringify(hookSuggestions),
        JSON.stringify(competitorInfo),
        now,
        now
      ]);
    }

    // Update search as completed
    const completedAt = new Date().toISOString();
    await run(`
      UPDATE intent_searches SET status = ?, completed_at = ?, results_count = ?
      WHERE id = ?
    `, ['completed', completedAt, results.length, searchId]);

    searchJobs.set(searchId, { status: 'completed', resultsCount: results.length });

    // Send Slack notification if configured
    await sendSlackNotification(missionObjective, results.length, searchId);

    console.log(`Search ${searchId} completed with ${results.length} results`);
  } catch (error) {
    console.error('Search execution error:', error);
    await run('UPDATE intent_searches SET status = ?, error_message = ? WHERE id = ?', ['failed', error.message, searchId]);
    searchJobs.set(searchId, { status: 'failed', error: error.message });
  }
}

// Excluded domains - platforms, not actual companies to prospect
const EXCLUDED_DOMAINS = [
  'youtube.com', 'linkedin.com', 'medium.com', 'twitter.com', 'x.com',
  'facebook.com', 'instagram.com', 'tiktok.com', 'reddit.com',
  'wikipedia.org', 'google.com', 'bing.com',
  'github.com', 'stackoverflow.com', 'quora.com',
  'forbes.com', 'businessinsider.com', 'techcrunch.com', 'venturebeat.com',
  'g2.com', 'capterra.com', 'trustradius.com', 'gartner.com',
  'crunchbase.com', 'pitchbook.com', 'cbinsights.com',
  'hubspot.com', 'salesforce.com', // Big platforms often appear in results
];

// Title patterns that indicate list/article, not a company
const LIST_ARTICLE_PATTERNS = [
  /^\d+\s+(top|best|leading)/i,
  /^(top|best|leading)\s+\d+/i,
  /^list of/i,
  /^(the\s+)?(complete|ultimate|definitive)\s+guide/i,
  /^how to/i,
  /^\d+\s+(ways|tips|strategies|steps)/i,
];

// Parse Tavily search results into lead format
function parseSearchResults(results, missionObjective, icpCriteria) {
  const leads = [];
  const seenCompanies = new Set();

  for (const result of results) {
    // Skip excluded domains
    if (isExcludedDomain(result.url)) {
      continue;
    }

    // Try to extract company name
    let companyName = extractCompanyName(result.title, result.url, result.content);
    if (!companyName) continue;

    // Skip duplicates
    const normalizedName = companyName.toLowerCase();
    if (seenCompanies.has(normalizedName)) continue;
    seenCompanies.add(normalizedName);

    // Determine industry from content
    const industry = detectIndustry(result.content, icpCriteria);

    // Extract pain points from content
    const identifiedPain = extractPainPoint(result.content, missionObjective);

    // Calculate confidence score based on relevance
    const confidenceScore = calculateConfidence(result, missionObjective, icpCriteria);

    leads.push({
      company_name: companyName,
      industry: industry,
      tech_stack: [],
      identified_pain: identifiedPain,
      confidence_score: confidenceScore,
      source_link: result.url
    });
  }

  return leads;
}

// Check if URL is from an excluded domain
function isExcludedDomain(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return EXCLUDED_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

// Common words that are NOT company names
const INVALID_COMPANY_NAMES = [
  'window', 'document', 'the', 'a', 'an', 'this', 'that', 'industry',
  'companies', 'company', 'business', 'businesses', 'startup', 'startups',
  'guide', 'article', 'blog', 'post', 'news', 'top', 'best', 'list',
  'how', 'what', 'why', 'when', 'where', 'lesson', 'chapter', 'part',
  'strategies', 'strategy', 'tips', 'ways', 'steps', 'insights'
];

// Extract company name from search result - use URL domain as primary source
function extractCompanyName(title, url, content) {
  // First check if title is a list/article pattern - skip these
  if (LIST_ARTICLE_PATTERNS.some(pattern => pattern.test(title))) {
    return null;
  }

  // Primary: Extract from URL domain (most reliable)
  let name = extractCompanyFromUrl(url);

  // Validate the name
  if (!name) return null;
  if (name.length < 3 || name.length > 40) return null;

  // Check if name is a common invalid word
  const nameLower = name.toLowerCase();
  if (INVALID_COMPANY_NAMES.includes(nameLower)) return null;

  // Check if name starts with number or contains only numbers
  if (/^\d/.test(name) || /^\d+$/.test(name)) return null;

  // Format name nicely
  // Keep acronyms uppercase (2-4 chars all caps)
  if (name.length <= 4 && name === name.toUpperCase()) {
    return name.toUpperCase();
  }

  // Title case for regular names
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Extract company name from URL domain
function extractCompanyFromUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    // Remove common prefixes
    let domain = hostname
      .replace(/^www\./, '')
      .replace(/^blog\./, '')
      .replace(/^app\./, '')
      .replace(/^docs\./, '')
      .replace(/^help\./, '');

    // Get the main domain part (before TLD)
    const parts = domain.split('.');
    if (parts.length < 2) return null;

    // Get domain name (second to last part for .co.uk style, or first part for .com)
    let name;
    if (parts.length >= 3 && ['co', 'com', 'org', 'net'].includes(parts[parts.length - 2])) {
      name = parts[parts.length - 3]; // e.g., example from example.co.uk
    } else {
      name = parts[0]; // e.g., example from example.com
    }

    // Clean up the name
    name = name.replace(/[-_]/g, ''); // Remove dashes and underscores

    if (name.length < 3) return null;

    return name;
  } catch {
    return null;
  }
}

// Detect industry from content
function detectIndustry(content, icpCriteria) {
  const contentLower = (content || '').toLowerCase();

  const industryKeywords = {
    'Technology': ['software', 'saas', 'tech', 'digital', 'app', 'platform', 'cloud'],
    'Healthcare': ['health', 'medical', 'hospital', 'patient', 'clinical', 'pharma'],
    'Finance': ['finance', 'bank', 'investment', 'fintech', 'payment', 'insurance'],
    'E-commerce': ['ecommerce', 'e-commerce', 'retail', 'shop', 'store', 'marketplace'],
    'Manufacturing': ['manufacturing', 'factory', 'production', 'industrial'],
    'Education': ['education', 'learning', 'school', 'university', 'training'],
    'Real Estate': ['real estate', 'property', 'housing', 'realty'],
    'Marketing': ['marketing', 'advertising', 'agency', 'media', 'content']
  };

  for (const [industry, keywords] of Object.entries(industryKeywords)) {
    if (keywords.some(kw => contentLower.includes(kw))) {
      return industry;
    }
  }

  // Use ICP criteria as fallback
  if (icpCriteria?.industries?.length > 0) {
    return icpCriteria.industries[0];
  }

  return 'Technology';
}

// Extract pain point from content based on mission objective
function extractPainPoint(content, missionObjective) {
  if (!content) return 'Potential fit based on search criteria';

  // Truncate content to first meaningful part
  const snippet = content.substring(0, 200);

  // Look for pain-related keywords
  const painIndicators = ['challenge', 'problem', 'struggle', 'need', 'looking for', 'seeking', 'scaling', 'growth'];

  for (const indicator of painIndicators) {
    const idx = content.toLowerCase().indexOf(indicator);
    if (idx !== -1) {
      // Extract sentence containing the indicator
      const start = Math.max(0, content.lastIndexOf('.', idx) + 1);
      const end = content.indexOf('.', idx + indicator.length);
      if (end > start) {
        return content.substring(start, end + 1).trim();
      }
    }
  }

  return snippet.length > 50 ? snippet + '...' : snippet;
}

// Calculate confidence score
function calculateConfidence(result, missionObjective, icpCriteria) {
  let score = 50; // Base score

  const content = (result.content || '').toLowerCase();
  const missionLower = missionObjective.toLowerCase();

  // Check for mission keywords in content
  const missionWords = missionLower.split(/\s+/).filter(w => w.length > 3);
  const matchedWords = missionWords.filter(w => content.includes(w));
  score += Math.min(30, matchedWords.length * 5);

  // Bonus for ICP criteria match
  if (icpCriteria?.industries) {
    for (const industry of icpCriteria.industries) {
      if (content.includes(industry.toLowerCase())) {
        score += 10;
        break;
      }
    }
  }

  // Cap at 95
  return Math.min(95, score);
}

// Generate personalized hook/icebreaker suggestions for a lead
function generateHookSuggestions(companyName, industry, painPoint, techStack) {
  const hooks = [];

  // Pain point focused hook
  if (painPoint) {
    const painHooks = {
      'Legacy system modernization needed': `Hi! I noticed ${companyName} might be dealing with legacy systems. We've helped similar ${industry || 'companies'} reduce their technical debt by 60% while modernizing their stack. Would you be open to a quick chat?`,
      'Technical debt accumulating': `Saw that ${companyName} is facing technical debt challenges - something we specialize in tackling for ${industry || 'organizations'} like yours. Our approach has helped teams ship 2x faster. Worth a conversation?`,
      'Outdated technology stack': `${companyName}'s tech stack caught my attention. Many ${industry || 'companies'} we work with faced similar modernization needs - we helped them transition without disrupting operations. Interested in learning more?`,
      'Scaling infrastructure challenges': `I came across ${companyName} and noticed you might be facing scaling challenges. We've helped ${industry || 'companies'} scale their infrastructure 10x without proportional cost increases. Would this be relevant?`,
      'Performance bottlenecks': `${companyName} caught my attention - performance optimization is our specialty. We helped a similar ${industry || 'company'} reduce response times by 80%. Would you be open to exploring how?`,
      'Manual processes need automation': `Noticed ${companyName} might benefit from process automation. We've helped ${industry || 'organizations'} automate 70% of manual tasks, freeing teams for high-value work. Interested?`,
      'AI integration opportunities': `AI implementation for ${industry || 'companies'} like ${companyName} is our sweet spot. We've delivered measurable ROI in under 6 months for similar organizations. Worth discussing?`,
    };

    const hookForPain = painHooks[painPoint] || `Hi! Based on my research on ${companyName}, it seems like "${painPoint}" might be a challenge. We've helped ${industry || 'companies'} solve exactly this. Want to connect?`;
    hooks.push(hookForPain);
  }

  // Tech stack focused hook
  if (techStack && techStack.length > 0) {
    const mainTech = techStack[0];
    hooks.push(`I saw ${companyName} uses ${mainTech} - we specialize in helping ${industry || 'teams'} optimize their ${mainTech} implementations. Our recent client saw 40% performance improvement. Would this be valuable for you?`);
  }

  // Industry focused hook
  if (industry) {
    const industryHooks = {
      'Healthcare': `Working with ${industry} companies like ${companyName} is our focus area. HIPAA compliance and system reliability are critical - we've helped organizations achieve both while modernizing. Interested in learning how?`,
      'Biotech': `${companyName}'s work in ${industry} is impressive. We help biotech companies like yours accelerate R&D with better data infrastructure. Would a brief conversation be valuable?`,
      'Pharmaceuticals': `Noticed ${companyName} in the pharmaceutical space - data integrity and compliance are areas where we excel. Happy to share how we've helped similar companies. Open to a quick call?`,
      'Technology': `Love what ${companyName} is building in tech. We help SaaS companies scale their engineering practices - something that could accelerate your roadmap. Want to explore?`,
      'Finance': `${companyName}'s position in ${industry} caught my eye. Security and performance are non-negotiable in finance - areas where we deliver consistently. Worth a conversation?`,
    };

    hooks.push(industryHooks[industry] || `${companyName}'s work in ${industry} is fascinating. We've helped several ${industry} companies tackle their biggest tech challenges. Would you be open to a brief chat about your current priorities?`);
  }

  // Generic personalized hook as fallback
  if (hooks.length < 3) {
    hooks.push(`Hi! I've been researching ${companyName} and was impressed by your growth in the ${industry || 'market'}. We work with similar companies on technical transformation - would you be interested in a no-pressure conversation about your current challenges?`);
  }

  // Ensure we always have exactly 3 hooks
  while (hooks.length < 3) {
    hooks.push(`I came across ${companyName} and would love to learn more about your technical initiatives. We specialize in helping ${industry || 'companies'} like yours achieve their goals faster. Open to connecting?`);
  }

  return hooks.slice(0, 3);
}

// Generate competitor/tool analysis based on industry and tech stack
function generateCompetitorInfo(industry, techStack) {
  const competitorInfo = {
    current_tools: [],
    likely_solutions: [],
    competitive_landscape: ''
  };

  // Determine current tools based on tech stack
  if (techStack && techStack.length > 0) {
    const toolMappings = {
      'AWS': { tool: 'Amazon Web Services', category: 'Cloud Infrastructure' },
      'Azure': { tool: 'Microsoft Azure', category: 'Cloud Infrastructure' },
      'GCP': { tool: 'Google Cloud Platform', category: 'Cloud Infrastructure' },
      'Java': { tool: 'Java Enterprise', category: 'Backend Framework' },
      '.NET': { tool: 'Microsoft .NET', category: 'Backend Framework' },
      'Python': { tool: 'Python Stack', category: 'Backend Framework' },
      'React': { tool: 'React.js', category: 'Frontend Framework' },
      'Angular': { tool: 'Angular', category: 'Frontend Framework' },
      'Node.js': { tool: 'Node.js', category: 'Runtime Environment' },
      'PostgreSQL': { tool: 'PostgreSQL', category: 'Database' },
      'MySQL': { tool: 'MySQL', category: 'Database' },
      'MongoDB': { tool: 'MongoDB', category: 'Database' },
      'SQL Server': { tool: 'Microsoft SQL Server', category: 'Database' }
    };

    for (const tech of techStack) {
      if (toolMappings[tech]) {
        competitorInfo.current_tools.push(toolMappings[tech]);
      }
    }
  }

  // Determine likely solutions and competitors based on industry
  const industryCompetitors = {
    'Finance': {
      solutions: ['Salesforce Financial Services Cloud', 'FIS Global', 'Temenos'],
      landscape: 'Highly competitive with established players. Legacy modernization is a key opportunity.'
    },
    'Banking': {
      solutions: ['Finastra', 'Jack Henry', 'FIS', 'Temenos Core Banking'],
      landscape: 'Core banking transformation market. Strong demand for digital-first solutions.'
    },
    'Healthcare': {
      solutions: ['Epic Systems', 'Cerner', 'Allscripts', 'Medidata'],
      landscape: 'HIPAA compliance critical. Integration with EHR systems is key differentiator.'
    },
    'Biotech': {
      solutions: ['Veeva Systems', 'IQVIA', 'Medidata', 'LabWare'],
      landscape: 'R&D acceleration and regulatory compliance are primary drivers.'
    },
    'Pharmaceuticals': {
      solutions: ['Veeva Vault', 'SAP for Life Sciences', 'Oracle Health Sciences'],
      landscape: 'Regulatory compliance and clinical trial management drive technology decisions.'
    },
    'Technology': {
      solutions: ['Atlassian', 'GitHub Enterprise', 'ServiceNow', 'Datadog'],
      landscape: 'Developer experience and DevOps maturity are competitive differentiators.'
    },
    'Insurance': {
      solutions: ['Guidewire', 'Duck Creek', 'Sapiens'],
      landscape: 'Claims processing modernization and digital customer experience are key.'
    },
    'Retail': {
      solutions: ['Shopify Plus', 'Salesforce Commerce Cloud', 'SAP Commerce'],
      landscape: 'Omnichannel experience and real-time inventory management drive decisions.'
    }
  };

  const industryInfo = industryCompetitors[industry];
  if (industryInfo) {
    competitorInfo.likely_solutions = industryInfo.solutions;
    competitorInfo.competitive_landscape = industryInfo.landscape;
  } else {
    competitorInfo.likely_solutions = ['Salesforce', 'Microsoft Dynamics', 'SAP'];
    competitorInfo.competitive_landscape = 'General enterprise software landscape with opportunity for specialized solutions.';
  }

  return competitorInfo;
}

// Send Slack notification when search completes
async function sendSlackNotification(missionObjective, resultsCount, searchId) {
  try {
    // Check if Slack notifications are enabled
    const slackEnabled = await get('SELECT value FROM system_settings WHERE key = ?', ['slack_notifications_enabled']);
    if (!slackEnabled || slackEnabled.value !== 'true') {
      console.log('Slack notifications not enabled, skipping notification');
      return;
    }

    // Get Slack webhook URL
    const slackSetting = await get('SELECT value FROM system_settings WHERE key = ?', ['slack_webhook_url']);
    if (!slackSetting || !slackSetting.value) {
      console.log('Slack webhook URL not configured, skipping notification');
      return;
    }

    const webhookUrl = slackSetting.value;
    const truncatedObjective = missionObjective.length > 100
      ? missionObjective.substring(0, 100) + '...'
      : missionObjective;

    // Send notification to Slack
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🔍 Intent Scraper Search Completed',
              emoji: true
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Results Found:*\n${resultsCount} leads`
              },
              {
                type: 'mrkdwn',
                text: `*Search ID:*\n${searchId.substring(0, 8)}...`
              }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Mission Objective:*\n${truncatedObjective}`
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: '📊 View results in Proces OS Sales Room'
              }
            ]
          }
        ]
      })
    });

    if (response.ok) {
      console.log(`Slack notification sent for search ${searchId}`);
    } else {
      const errorText = await response.text();
      console.error('Slack notification failed:', errorText);
    }
  } catch (error) {
    console.error('Error sending Slack notification:', error);
    // Don't throw - Slack notification failure shouldn't fail the search
  }
}

export default router;
