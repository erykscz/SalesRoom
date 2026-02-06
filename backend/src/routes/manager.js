import express from 'express';
import { get, all } from '../db/database.js';

// Manager dashboard API - Updated
const router = express.Router();

// GET /api/manager/dashboard - Get team performance metrics
router.get('/dashboard', async (req, res) => {
  try {
    // Check if user has manager or admin role
    if (req.user.role !== 'manager' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Manager role required.' });
    }

    // Get all deals (managers see all deals)
    const deals = await all(`
      SELECT d.*, u.name as owner_name, u.email as owner_email
      FROM deals d
      LEFT JOIN users u ON d.owner_id = u.id
      WHERE d.is_archived = 0
    `);

    // Calculate total team deals
    const totalDeals = deals.length;

    // Calculate deals by stage
    const dealsByStage = deals.reduce((acc, deal) => {
      acc[deal.stage] = (acc[deal.stage] || 0) + 1;
      return acc;
    }, {});

    // Calculate weighted forecast (probability * value)
    const stageProbabilities = {
      'new_signal': 0.05,
      'qualified': 0.15,
      'discovery': 0.30,
      'solution_design': 0.50,
      'negotiation': 0.75,
      'closed_won': 1.0,
      'closed_lost': 0
    };

    const weightedForecast = deals.reduce((total, deal) => {
      const probability = stageProbabilities[deal.stage] || 0;
      const value = deal.estimated_value || 0;
      return total + (probability * value);
    }, 0);

    // Calculate total pipeline value
    const totalPipelineValue = deals.reduce((total, deal) => {
      if (deal.stage !== 'closed_won' && deal.stage !== 'closed_lost') {
        return total + (deal.estimated_value || 0);
      }
      return total;
    }, 0);

    // Calculate closed won value
    const closedWonValue = deals.reduce((total, deal) => {
      if (deal.stage === 'closed_won') {
        return total + (deal.estimated_value || 0);
      }
      return total;
    }, 0);

    // Get rep performance rankings
    const repPerformance = await all(`
      SELECT
        u.id,
        u.name,
        u.email,
        COUNT(d.id) as total_deals,
        SUM(CASE WHEN d.stage = 'closed_won' THEN 1 ELSE 0 END) as closed_won,
        SUM(CASE WHEN d.stage = 'closed_lost' THEN 1 ELSE 0 END) as closed_lost,
        SUM(CASE WHEN d.stage = 'closed_won' THEN d.estimated_value ELSE 0 END) as won_value,
        SUM(CASE WHEN d.stage NOT IN ('closed_won', 'closed_lost') THEN d.estimated_value ELSE 0 END) as pipeline_value,
        AVG(d.health_score) as avg_health_score
      FROM users u
      LEFT JOIN deals d ON u.id = d.owner_id AND d.is_archived = 0
      WHERE u.role IN ('rep', 'sdr', 'ae', 'manager', 'admin')
      GROUP BY u.id
      ORDER BY won_value DESC
    `);

    // Get recent activities across all deals
    const recentActivities = await all(`
      SELECT a.*, d.company_name, u.name as created_by_name
      FROM activities a
      LEFT JOIN deals d ON a.deal_id = d.id
      LEFT JOIN users u ON a.created_by = u.id
      ORDER BY a.created_at DESC
      LIMIT 10
    `);

    // Calculate average deal health
    const avgHealthScore = deals.length > 0
      ? Math.round(deals.reduce((sum, d) => sum + (d.health_score || 0), 0) / deals.length)
      : 0;

    // Get deals at risk (health score < 40)
    const atRiskDeals = deals.filter(d =>
      d.health_score < 40 &&
      d.stage !== 'closed_won' &&
      d.stage !== 'closed_lost'
    );

    res.json({
      stats: {
        totalDeals,
        totalPipelineValue,
        weightedForecast,
        closedWonValue,
        avgHealthScore,
        atRiskCount: atRiskDeals.length
      },
      dealsByStage,
      repPerformance: repPerformance.map(rep => ({
        ...rep,
        winRate: rep.closed_won + rep.closed_lost > 0
          ? Math.round((rep.closed_won / (rep.closed_won + rep.closed_lost)) * 100)
          : 0,
        avg_health_score: Math.round(rep.avg_health_score || 0)
      })),
      atRiskDeals: atRiskDeals.slice(0, 5),
      recentActivities
    });
  } catch (error) {
    console.error('Error fetching manager dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// GET /api/manager/team-pipeline - Get team pipeline view
router.get('/team-pipeline', async (req, res) => {
  try {
    if (req.user.role !== 'manager' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Manager role required.' });
    }

    const deals = await all(`
      SELECT d.*, u.name as owner_name, u.email as owner_email
      FROM deals d
      LEFT JOIN users u ON d.owner_id = u.id
      WHERE d.is_archived = 0
      ORDER BY d.stage, d.estimated_value DESC
    `);

    // Group by owner
    const pipelineByRep = deals.reduce((acc, deal) => {
      const ownerId = deal.owner_id || 'unassigned';
      if (!acc[ownerId]) {
        acc[ownerId] = {
          owner_name: deal.owner_name || 'Unassigned',
          owner_email: deal.owner_email,
          deals: []
        };
      }
      acc[ownerId].deals.push(deal);
      return acc;
    }, {});

    res.json({ pipeline: Object.values(pipelineByRep), totalDeals: deals.length });
  } catch (error) {
    console.error('Error fetching team pipeline:', error);
    res.status(500).json({ error: 'Failed to fetch team pipeline' });
  }
});

// GET /api/manager/rep-performance - Get detailed rep performance
router.get('/rep-performance', async (req, res) => {
  try {
    if (req.user.role !== 'manager' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Manager role required.' });
    }

    const repStats = await all(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        COUNT(d.id) as total_deals,
        SUM(CASE WHEN d.stage = 'closed_won' THEN 1 ELSE 0 END) as closed_won,
        SUM(CASE WHEN d.stage = 'closed_lost' THEN 1 ELSE 0 END) as closed_lost,
        SUM(CASE WHEN d.stage = 'closed_won' THEN d.estimated_value ELSE 0 END) as won_value,
        SUM(d.estimated_value) as total_value,
        AVG(d.health_score) as avg_health_score
      FROM users u
      LEFT JOIN deals d ON u.id = d.owner_id AND d.is_archived = 0
      WHERE u.role IN ('rep', 'sdr', 'ae', 'manager', 'admin')
      GROUP BY u.id
      ORDER BY won_value DESC
    `);

    res.json({
      reps: repStats.map(rep => ({
        ...rep,
        winRate: rep.closed_won + rep.closed_lost > 0
          ? Math.round((rep.closed_won / (rep.closed_won + rep.closed_lost)) * 100)
          : 0,
        avg_health_score: Math.round(rep.avg_health_score || 0)
      }))
    });
  } catch (error) {
    console.error('Error fetching rep performance:', error);
    res.status(500).json({ error: 'Failed to fetch rep performance' });
  }
});

// GET /api/manager/forecast - Get sales forecast
router.get('/forecast', async (req, res) => {
  try {
    if (req.user.role !== 'manager' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Manager role required.' });
    }

    const deals = await all(`
      SELECT d.*, u.name as owner_name
      FROM deals d
      LEFT JOIN users u ON d.owner_id = u.id
      WHERE d.is_archived = 0 AND d.stage NOT IN ('closed_won', 'closed_lost')
    `);

    const stageProbabilities = {
      'new_signal': 0.05,
      'qualified': 0.15,
      'discovery': 0.30,
      'solution_design': 0.50,
      'negotiation': 0.75
    };

    // Calculate forecast by stage
    const forecastByStage = {};
    deals.forEach(deal => {
      const stage = deal.stage;
      if (!forecastByStage[stage]) {
        forecastByStage[stage] = {
          stage,
          count: 0,
          totalValue: 0,
          weightedValue: 0,
          probability: stageProbabilities[stage] || 0
        };
      }
      forecastByStage[stage].count++;
      forecastByStage[stage].totalValue += deal.estimated_value || 0;
      forecastByStage[stage].weightedValue += (deal.estimated_value || 0) * (stageProbabilities[stage] || 0);
    });

    // Calculate forecast by close date (monthly)
    const forecastByMonth = {};
    deals.forEach(deal => {
      if (deal.close_date) {
        const month = deal.close_date.substring(0, 7); // YYYY-MM
        if (!forecastByMonth[month]) {
          forecastByMonth[month] = {
            month,
            count: 0,
            totalValue: 0,
            weightedValue: 0
          };
        }
        forecastByMonth[month].count++;
        forecastByMonth[month].totalValue += deal.estimated_value || 0;
        forecastByMonth[month].weightedValue += (deal.estimated_value || 0) * (stageProbabilities[deal.stage] || 0);
      }
    });

    const totalPipeline = deals.reduce((sum, d) => sum + (d.estimated_value || 0), 0);
    const totalWeighted = deals.reduce((sum, d) => sum + ((d.estimated_value || 0) * (stageProbabilities[d.stage] || 0)), 0);

    res.json({
      summary: {
        totalPipeline,
        totalWeighted,
        dealCount: deals.length
      },
      byStage: Object.values(forecastByStage),
      byMonth: Object.values(forecastByMonth).sort((a, b) => a.month.localeCompare(b.month))
    });
  } catch (error) {
    console.error('Error fetching forecast:', error);
    res.status(500).json({ error: 'Failed to fetch forecast' });
  }
});

// GET /api/manager/stagnation - Get deals stuck in stages
router.get('/stagnation', async (req, res) => {
  try {
    if (req.user.role !== 'manager' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Manager role required.' });
    }

    const { min_days = 10 } = req.query;
    const minDays = parseInt(min_days) || 10;

    // Get deals with their last stage change activity
    const deals = await all(`
      SELECT
        d.id,
        d.company_name,
        d.stage,
        d.estimated_value,
        d.health_score,
        d.owner_id,
        d.created_at,
        d.updated_at,
        u.name as owner_name,
        COALESCE(
          (SELECT MAX(a.created_at) FROM activities a
           WHERE a.deal_id = d.id AND a.activity_type = 'stage_changed'),
          d.created_at
        ) as last_stage_change
      FROM deals d
      LEFT JOIN users u ON d.owner_id = u.id
      WHERE d.is_archived = 0
        AND d.stage NOT IN ('closed_won', 'closed_lost')
      ORDER BY d.stage, d.updated_at ASC
    `);

    // Calculate days in current stage
    const now = new Date();
    const stagnantDeals = deals.map(deal => {
      const lastChange = new Date(deal.last_stage_change);
      const daysInStage = Math.floor((now - lastChange) / (1000 * 60 * 60 * 24));
      return {
        ...deal,
        days_in_stage: daysInStage
      };
    }).filter(deal => deal.days_in_stage >= minDays)
      .sort((a, b) => b.days_in_stage - a.days_in_stage);

    // Group by stage
    const byStage = stagnantDeals.reduce((acc, deal) => {
      if (!acc[deal.stage]) {
        acc[deal.stage] = [];
      }
      acc[deal.stage].push(deal);
      return acc;
    }, {});

    res.json({
      stagnantDeals,
      byStage,
      totalStagnant: stagnantDeals.length,
      minDaysThreshold: minDays
    });
  } catch (error) {
    console.error('Error fetching stagnation report:', error);
    res.status(500).json({ error: 'Failed to fetch stagnation report' });
  }
});

export default router;
