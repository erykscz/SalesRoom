import express from 'express';
import { get, run, all } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Helper: parse research profile JSON fields (same pattern as research.js)
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
    suggested_next_steps: research.suggested_next_steps ? JSON.parse(research.suggested_next_steps) : null,
    platforms_searched: JSON.parse(research.platforms_searched || '[]'),
    platforms_succeeded: JSON.parse(research.platforms_succeeded || '[]'),
    error_log: JSON.parse(research.error_log || '[]'),
  };
}

// POST /api/battlecards/meeting-prep/:dealId - Generate AI meeting prep briefing + predicted objections
router.post('/meeting-prep/:dealId', async (req, res) => {
  try {
    const { dealId } = req.params;

    // Parallel DB queries
    const [deal, researchRaw, socialProfiles, activities, transcripts] = await Promise.all([
      get(`SELECT d.*, u.name as owner_name FROM deals d LEFT JOIN users u ON d.owner_id = u.id WHERE d.id = ?`, [dealId]),
      get(`SELECT * FROM research_profiles WHERE deal_id = ? ORDER BY created_at DESC LIMIT 1`, [dealId]),
      all(`SELECT * FROM social_profiles WHERE deal_id = ? ORDER BY platform`, [dealId]),
      all(`SELECT * FROM activities WHERE deal_id = ? ORDER BY created_at DESC LIMIT 20`, [dealId]),
      all(`SELECT * FROM transcripts WHERE deal_id = ? ORDER BY created_at DESC`, [dealId]),
    ]);

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const research = parseResearchProfile(researchRaw);

    // Extract person info from LinkedIn research
    const linkedinPerson = research?.linkedin_data?.person || null;
    const linkedinCompany = research?.linkedin_data?.company || research?.linkedin_data || null;
    const websiteData = research?.website_data || null;

    // Build briefing object
    const briefing = {
      person: {
        name: deal.name || null,
        job_title: deal.job_title || linkedinPerson?.headline || null,
        email: deal.email || null,
        phone: deal.phone || null,
        linkedin_url: deal.linkedin_url || null,
        headline: linkedinPerson?.headline || null,
        summary: linkedinPerson?.summary || null,
        skills: linkedinPerson?.skills || [],
      },
      company: {
        name: deal.company_name || null,
        industry: deal.industry || linkedinCompany?.industry || websiteData?.industry || null,
        company_size: linkedinCompany?.company_size || null,
        headquarters: linkedinCompany?.headquarters || websiteData?.address || null,
        description: linkedinCompany?.description || websiteData?.description || null,
        company_url: deal.company_url || null,
      },
      deal_status: {
        stage: deal.stage,
        health_score: deal.health_score,
        estimated_value: deal.estimated_value,
        priority: deal.priority,
        has_decision_maker: deal.has_decision_maker === 1,
        has_confirmed_budget: deal.has_confirmed_budget === 1,
        next_step_date: deal.next_step_date,
        next_step_description: deal.next_step_description,
        close_date: deal.close_date,
        days_in_pipeline: deal.created_at ? Math.floor((Date.now() - new Date(deal.created_at).getTime()) / (1000 * 60 * 60 * 24)) : null,
        owner_name: deal.owner_name || null,
      },
      discovery_insights: {
        pain_points: [],
        red_flags: [],
        stakeholders: [],
      },
      activity_summary: {
        total_activities: activities.length,
        notes_count: activities.filter(a => a.activity_type === 'note').length,
        last_activity_date: activities.length > 0 ? activities[0].created_at : null,
        transcript_count: transcripts.length,
        has_sales_room: activities.some(a => a.activity_type === 'sales_room_created'),
      },
      research_summary: research?.research_summary || null,
    };

    // Aggregate discovery insights from processed transcripts
    for (const t of transcripts) {
      if (t.processed && t.insights) {
        try {
          const insights = JSON.parse(t.insights);
          if (insights.pain_points) briefing.discovery_insights.pain_points.push(...insights.pain_points);
          if (insights.red_flags) briefing.discovery_insights.red_flags.push(...insights.red_flags);
          if (insights.stakeholders) briefing.discovery_insights.stakeholders.push(...insights.stakeholders);
        } catch { /* ignore parse errors */ }
      }
    }

    // Deduplicate insights
    briefing.discovery_insights.pain_points = [...new Set(briefing.discovery_insights.pain_points)];
    briefing.discovery_insights.red_flags = [...new Set(briefing.discovery_insights.red_flags)];
    briefing.discovery_insights.stakeholders = [...new Set(briefing.discovery_insights.stakeholders)];

    // AI call for predicted objections
    let predictions = [];
    let aiModelUsed = null;
    let aiError = null;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const hasKey = apiKey && apiKey !== 'your_anthropic_api_key_here';

    if (hasKey) {
      // Build context for AI
      const contextSections = [];

      contextSections.push(`Osoba: ${briefing.person.name || 'Nieznana'}, ${briefing.person.job_title || 'brak stanowiska'}`);
      if (briefing.person.summary) contextSections.push(`Opis osoby: ${briefing.person.summary.substring(0, 300)}`);

      contextSections.push(`Firma: ${briefing.company.name || 'Nieznana'}, Branża: ${briefing.company.industry || 'nieznana'}, Wielkość: ${briefing.company.company_size || 'nieznana'}`);
      if (briefing.company.description) contextSections.push(`Opis firmy: ${briefing.company.description.substring(0, 300)}`);

      contextSections.push(`Etap deala: ${briefing.deal_status.stage}, Wartość: ${briefing.deal_status.estimated_value || 'nie podana'}, Priorytet: ${briefing.deal_status.priority}, Health Score: ${briefing.deal_status.health_score}/100`);
      contextSections.push(`Decision Maker: ${briefing.deal_status.has_decision_maker ? 'Tak' : 'Nie'}, Budżet potwierdzony: ${briefing.deal_status.has_confirmed_budget ? 'Tak' : 'Nie'}`);
      if (briefing.deal_status.next_step_description) contextSections.push(`Następny krok: ${briefing.deal_status.next_step_description}`);

      if (briefing.discovery_insights.pain_points.length > 0) {
        contextSections.push(`Pain points z rozmów: ${briefing.discovery_insights.pain_points.join('; ')}`);
      }
      if (briefing.discovery_insights.red_flags.length > 0) {
        contextSections.push(`Red flags: ${briefing.discovery_insights.red_flags.join('; ')}`);
      }

      contextSections.push(`Aktywności: ${briefing.activity_summary.total_activities} łącznie, ${briefing.activity_summary.transcript_count} transkryptów, ${briefing.activity_summary.notes_count} notatek`);
      contextSections.push(`Dni w pipeline: ${briefing.deal_status.days_in_pipeline || 'nieznane'}`);

      if (briefing.research_summary) {
        contextSections.push(`Podsumowanie z researchu:\n${briefing.research_summary.substring(0, 500)}`);
      }

      const systemPrompt = `Jesteś ekspertem B2B sales z 15-letnim doświadczeniem. Na podstawie danych o dealu i osobie, przewiduj obiekcje które mogą pojawić się na spotkaniu. Odpowiadaj WYŁĄCZNIE w formacie JSON (bez markdown, bez komentarzy). Pisz po polsku.`;

      const userPrompt = `Na podstawie poniższych danych o dealu, przewidź 3-5 najbardziej prawdopodobnych obiekcji, które mogą pojawić się na spotkaniu.

${contextSections.join('\n')}

Odpowiedz WYŁĄCZNIE w formacie JSON:
[{"category": "price|technology|trust|competition|timing|features", "objection": "treść obiekcji", "reason": "dlaczego ta obiekcja jest prawdopodobna w kontekście tego dealu", "suggested_response": "sugerowana odpowiedź handlowca"}]

Wymagania:
- Maksymalnie 5 obiekcji
- Każda obiekcja powinna być spersonalizowana do kontekstu tego dealu (branża, etap, pain points)
- category musi być jedną z: price, technology, trust, competition, timing, features
- suggested_response powinno używać frameworku ARC (Acknowledge, Reframe, Counter)
- Pisz po polsku`;

      const models = [
        process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        'claude-3-haiku-20240307',
      ];

      for (const model of models) {
        const maxRetries = 2;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model,
                max_tokens: 1500,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
              }),
            });

            if (aiRes.ok) {
              const aiData = await aiRes.json();
              const text = aiData.content?.[0]?.text;
              if (text) {
                // Parse JSON - handle possible markdown wrapping
                const jsonMatch = text.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                  predictions = JSON.parse(jsonMatch[0]);
                  aiModelUsed = model;
                }
              }
              break;
            }

            const retryable = [429, 500, 502, 503, 529];
            if (retryable.includes(aiRes.status) && attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, attempt * 2000));
              continue;
            }
            break;
          } catch (err) {
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, attempt * 2000));
              continue;
            }
            break;
          }
        }
        if (predictions.length > 0) break;
      }

      if (predictions.length === 0 && !aiModelUsed) {
        aiError = 'AI prediction failed - all models exhausted';
      }
    } else {
      aiError = 'ANTHROPIC_API_KEY not configured';
    }

    res.json({
      briefing,
      predictions,
      ai_model_used: aiModelUsed,
      ai_error: aiError,
    });
  } catch (error) {
    console.error('Error generating meeting prep:', error);
    res.status(500).json({ error: 'Failed to generate meeting prep' });
  }
});

// Note: Authentication is applied in index.js before this router

// Valid categories
const VALID_CATEGORIES = ['price', 'technology', 'trust', 'competition', 'timing', 'features'];

// GET /api/battlecards - List all battlecards with optional filters
router.get('/', async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = `
      SELECT b.*, u.name as created_by_name
      FROM battlecards b
      LEFT JOIN users u ON b.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (category && VALID_CATEGORIES.includes(category)) {
      query += ` AND b.category = ?`;
      params.push(category);
    }

    if (search) {
      query += ` AND (b.objection_text LIKE ? OR b.arc_response LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY b.feedback_score DESC, b.created_at DESC`;

    const battlecards = await all(query, params);

    // Parse JSON fields
    const parsedBattlecards = battlecards.map(bc => ({
      ...bc,
      arc_response: bc.arc_response ? JSON.parse(bc.arc_response) : null,
      case_study_links: bc.case_study_links ? JSON.parse(bc.case_study_links) : []
    }));

    res.json({ battlecards: parsedBattlecards });
  } catch (error) {
    console.error('Error fetching battlecards:', error);
    res.status(500).json({ error: 'Failed to fetch battlecards' });
  }
});

// POST /api/battlecards - Create new battlecard
router.post('/', async (req, res) => {
  try {
    const { category, objection_text, arc_response, case_study_links, is_shared } = req.body;

    // Validation
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Valid category is required' });
    }

    if (!objection_text || !objection_text.trim()) {
      return res.status(400).json({ error: 'Objection text is required' });
    }

    if (!arc_response || !arc_response.acknowledge || !arc_response.reframe || !arc_response.counter) {
      return res.status(400).json({ error: 'ARC response (acknowledge, reframe, counter) is required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await run(`
      INSERT INTO battlecards (id, category, objection_text, arc_response, case_study_links, is_shared, created_by, feedback_score, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `, [
      id,
      category,
      objection_text.trim(),
      JSON.stringify(arc_response),
      JSON.stringify(case_study_links || []),
      is_shared ? 1 : 0,
      req.user.id,
      now,
      now
    ]);

    const battlecard = await get(`
      SELECT b.*, u.name as created_by_name
      FROM battlecards b
      LEFT JOIN users u ON b.created_by = u.id
      WHERE b.id = ?
    `, [id]);

    res.status(201).json({
      battlecard: {
        ...battlecard,
        arc_response: JSON.parse(battlecard.arc_response),
        case_study_links: JSON.parse(battlecard.case_study_links || '[]')
      }
    });
  } catch (error) {
    console.error('Error creating battlecard:', error);
    res.status(500).json({ error: 'Failed to create battlecard' });
  }
});

// GET /api/battlecards/:id - Get single battlecard
router.get('/:id', async (req, res) => {
  try {
    const battlecard = await get(`
      SELECT b.*, u.name as created_by_name
      FROM battlecards b
      LEFT JOIN users u ON b.created_by = u.id
      WHERE b.id = ?
    `, [req.params.id]);

    if (!battlecard) {
      return res.status(404).json({ error: 'Battlecard not found' });
    }

    res.json({
      battlecard: {
        ...battlecard,
        arc_response: battlecard.arc_response ? JSON.parse(battlecard.arc_response) : null,
        case_study_links: battlecard.case_study_links ? JSON.parse(battlecard.case_study_links) : []
      }
    });
  } catch (error) {
    console.error('Error fetching battlecard:', error);
    res.status(500).json({ error: 'Failed to fetch battlecard' });
  }
});

// PUT /api/battlecards/:id - Update battlecard
router.put('/:id', async (req, res) => {
  try {
    const battlecard = await get('SELECT * FROM battlecards WHERE id = ?', [req.params.id]);

    if (!battlecard) {
      return res.status(404).json({ error: 'Battlecard not found' });
    }

    // Only creator or admin can edit
    if (battlecard.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only edit your own battlecards' });
    }

    const { objection_text, arc_response, case_study_links, is_shared } = req.body;
    const now = new Date().toISOString();

    await run(`
      UPDATE battlecards
      SET objection_text = COALESCE(?, objection_text),
          arc_response = COALESCE(?, arc_response),
          case_study_links = COALESCE(?, case_study_links),
          is_shared = COALESCE(?, is_shared),
          updated_at = ?
      WHERE id = ?
    `, [
      objection_text ? objection_text.trim() : null,
      arc_response ? JSON.stringify(arc_response) : null,
      case_study_links ? JSON.stringify(case_study_links) : null,
      is_shared !== undefined ? (is_shared ? 1 : 0) : null,
      now,
      req.params.id
    ]);

    const updated = await get(`
      SELECT b.*, u.name as created_by_name
      FROM battlecards b
      LEFT JOIN users u ON b.created_by = u.id
      WHERE b.id = ?
    `, [req.params.id]);

    res.json({
      battlecard: {
        ...updated,
        arc_response: updated.arc_response ? JSON.parse(updated.arc_response) : null,
        case_study_links: updated.case_study_links ? JSON.parse(updated.case_study_links) : []
      }
    });
  } catch (error) {
    console.error('Error updating battlecard:', error);
    res.status(500).json({ error: 'Failed to update battlecard' });
  }
});

// DELETE /api/battlecards/:id - Delete battlecard
router.delete('/:id', async (req, res) => {
  try {
    const battlecard = await get('SELECT * FROM battlecards WHERE id = ?', [req.params.id]);

    if (!battlecard) {
      return res.status(404).json({ error: 'Battlecard not found' });
    }

    // Only creator or admin can delete
    if (battlecard.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own battlecards' });
    }

    await run('DELETE FROM battlecards WHERE id = ?', [req.params.id]);

    res.json({ success: true, message: 'Battlecard deleted' });
  } catch (error) {
    console.error('Error deleting battlecard:', error);
    res.status(500).json({ error: 'Failed to delete battlecard' });
  }
});

// POST /api/battlecards/:id/feedback - Upvote/downvote
router.post('/:id/feedback', async (req, res) => {
  try {
    const { vote } = req.body; // 'up' or 'down'

    if (!['up', 'down'].includes(vote)) {
      return res.status(400).json({ error: 'Vote must be "up" or "down"' });
    }

    const battlecard = await get('SELECT * FROM battlecards WHERE id = ?', [req.params.id]);

    if (!battlecard) {
      return res.status(404).json({ error: 'Battlecard not found' });
    }

    const change = vote === 'up' ? 1 : -1;

    await run(`
      UPDATE battlecards
      SET feedback_score = feedback_score + ?
      WHERE id = ?
    `, [change, req.params.id]);

    const updated = await get('SELECT feedback_score FROM battlecards WHERE id = ?', [req.params.id]);

    res.json({
      success: true,
      feedback_score: updated.feedback_score
    });
  } catch (error) {
    console.error('Error updating feedback:', error);
    res.status(500).json({ error: 'Failed to update feedback' });
  }
});

export default router;
