import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';

const router = express.Router();

// In-memory search status tracking (in production, use a job queue like Bull)
const searchJobs = new Map();

// List all searches for the current user
router.get('/searches', (req, res) => {
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
      ? db.prepare(query).all()
      : db.prepare(query).all(userId);

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
router.get('/searches/:id', (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const isManager = req.user.role === 'manager';

    const search = db.prepare(`
      SELECT s.*, u.name as owner_name
      FROM intent_searches s
      LEFT JOIN users u ON s.owner_id = u.id
      WHERE s.id = ?
    `).get(id);

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
    const leads = db.prepare(`
      SELECT l.*, u.name as owner_name
      FROM leads l
      LEFT JOIN users u ON l.owner_id = u.id
      WHERE l.search_id = ?
      ORDER BY l.confidence_score DESC
    `).all(id);

    res.json({ search, leads });
  } catch (error) {
    console.error('Error fetching search:', error);
    res.status(500).json({ error: 'Failed to fetch search' });
  }
});

// Start a new search
router.post('/search', (req, res) => {
  try {
    const userId = req.user.id;
    const { mission_objective, icp_template_id } = req.body;

    if (!mission_objective || mission_objective.trim().length === 0) {
      return res.status(400).json({ error: 'Mission objective is required' });
    }

    const searchId = uuidv4();
    const now = new Date().toISOString();

    // Create search record
    db.prepare(`
      INSERT INTO intent_searches (id, mission_objective, icp_template_id, status, owner_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(searchId, mission_objective.trim(), icp_template_id || null, 'queued', userId, now);

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

// Simulate search execution (in production, this would use actual search APIs)
async function executeSearch(searchId, missionObjective, icpTemplateId, userId) {
  try {
    // Update status to running
    searchJobs.set(searchId, { status: 'running' });
    db.prepare('UPDATE intent_searches SET status = ? WHERE id = ?').run('running', searchId);

    // Simulate processing time (1-3 seconds)
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1500));

    // Get ICP criteria if template provided
    let icpCriteria = null;
    if (icpTemplateId) {
      const template = db.prepare('SELECT criteria FROM icp_templates WHERE id = ?').get(icpTemplateId);
      if (template) {
        try {
          icpCriteria = JSON.parse(template.criteria);
        } catch (e) {
          console.error('Error parsing ICP criteria:', e);
        }
      }
    }

    // Parse mission objective for keywords
    const keywords = missionObjective.toLowerCase();

    // Generate simulated results based on keywords
    const results = generateSimulatedResults(keywords, icpCriteria);

    // Insert leads into database with hook suggestions and competitor info
    const now = new Date().toISOString();
    for (const result of results) {
      const leadId = uuidv4();
      // Generate hook suggestions for this lead
      const hookSuggestions = generateHookSuggestions(result.company_name, result.industry, result.identified_pain, result.tech_stack);
      // Generate competitor/tool analysis for this lead
      const competitorInfo = generateCompetitorInfo(result.industry, result.tech_stack);

      db.prepare(`
        INSERT INTO leads (id, company_name, industry, tech_stack, identified_pain, confidence_score, source_link, status, search_id, owner_id, hook_suggestions, competitor_info, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        leadId,
        result.company_name,
        result.industry,
        JSON.stringify(result.tech_stack),
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
      );
    }

    // Update search as completed
    const completedAt = new Date().toISOString();
    db.prepare(`
      UPDATE intent_searches SET status = ?, completed_at = ?, results_count = ?
      WHERE id = ?
    `).run('completed', completedAt, results.length, searchId);

    searchJobs.set(searchId, { status: 'completed', resultsCount: results.length });

    // Send Slack notification if configured
    await sendSlackNotification(missionObjective, results.length, searchId);

    console.log(`Search ${searchId} completed with ${results.length} results`);
  } catch (error) {
    console.error('Search execution error:', error);
    db.prepare('UPDATE intent_searches SET status = ? WHERE id = ?').run('failed', searchId);
    searchJobs.set(searchId, { status: 'failed', error: error.message });
  }
}

// Generate simulated search results based on keywords
function generateSimulatedResults(keywords, icpCriteria) {
  const results = [];

  // Determine industry focus
  let industries = ['Technology', 'Healthcare', 'Finance', 'Manufacturing', 'Retail'];
  if (icpCriteria?.industries?.length > 0) {
    industries = icpCriteria.industries;
  } else if (keywords.includes('healthcare') || keywords.includes('medical')) {
    industries = ['Healthcare', 'Biotech', 'Pharmaceuticals'];
  } else if (keywords.includes('finance') || keywords.includes('bank')) {
    industries = ['Finance', 'Banking', 'Insurance'];
  } else if (keywords.includes('tech') || keywords.includes('software')) {
    industries = ['Technology', 'Software', 'SaaS'];
  }

  // Determine tech stack focus
  let techStacks = [
    ['AWS', 'Java', 'PostgreSQL'],
    ['Azure', '.NET', 'SQL Server'],
    ['GCP', 'Python', 'MongoDB'],
    ['React', 'Node.js', 'PostgreSQL'],
    ['Angular', 'Java', 'MySQL']
  ];
  if (icpCriteria?.tech_stack?.length > 0) {
    techStacks = [icpCriteria.tech_stack];
  }

  // Determine pain points
  let painPoints = [
    'Legacy system modernization needed',
    'Scaling challenges with current infrastructure',
    'Manual processes causing inefficiencies',
    'Data silos preventing insights',
    'Security compliance requirements'
  ];
  if (icpCriteria?.pain_points?.length > 0) {
    painPoints = icpCriteria.pain_points;
  } else if (keywords.includes('legacy') || keywords.includes('moderniz')) {
    painPoints = ['Legacy system migration needed', 'Technical debt accumulating', 'Outdated technology stack'];
  } else if (keywords.includes('scale') || keywords.includes('growth')) {
    painPoints = ['Scaling infrastructure challenges', 'Performance bottlenecks', 'Growth planning difficulties'];
  } else if (keywords.includes('ai') || keywords.includes('automat')) {
    painPoints = ['Manual processes need automation', 'AI integration opportunities', 'Process optimization needed'];
  }

  // Company name prefixes for variety
  const companyPrefixes = ['Global', 'Advanced', 'Dynamic', 'Innovative', 'Premier', 'Strategic', 'Enterprise', 'Digital', 'Smart', 'Next'];
  const companySuffixes = ['Solutions', 'Technologies', 'Systems', 'Corp', 'Industries', 'Group', 'Partners', 'Labs', 'Dynamics', 'Tech'];

  // Generate 3-8 results
  const numResults = 3 + Math.floor(Math.random() * 6);

  for (let i = 0; i < numResults; i++) {
    const prefix = companyPrefixes[Math.floor(Math.random() * companyPrefixes.length)];
    const suffix = companySuffixes[Math.floor(Math.random() * companySuffixes.length)];
    const industry = industries[Math.floor(Math.random() * industries.length)];
    const techStack = techStacks[Math.floor(Math.random() * techStacks.length)];
    const painPoint = painPoints[Math.floor(Math.random() * painPoints.length)];

    // Confidence score based on keyword match
    let confidence = 50 + Math.floor(Math.random() * 30);
    if (keywords.length > 50) confidence += 10;
    if (icpCriteria) confidence += 10;
    confidence = Math.min(confidence, 95);

    results.push({
      company_name: `${prefix} ${industry} ${suffix}`,
      industry: industry,
      tech_stack: techStack,
      identified_pain: painPoint,
      confidence_score: confidence,
      source_link: `https://example.com/company/${prefix.toLowerCase()}-${suffix.toLowerCase()}`
    });
  }

  return results;
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
    const slackEnabled = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('slack_notifications_enabled');
    if (!slackEnabled || slackEnabled.value !== 'true') {
      console.log('Slack notifications not enabled, skipping notification');
      return;
    }

    // Get Slack webhook URL
    const slackSetting = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('slack_webhook_url');
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
