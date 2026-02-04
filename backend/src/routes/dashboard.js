import express from 'express';
import { get, all } from '../db/database.js';

const router = express.Router();

// GET /api/dashboard/stats - Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Build where clause based on role
    const isManager = userRole === 'manager' || userRole === 'admin';
    const ownerParams = isManager ? [] : [userId];

    // Get deals count (not archived)
    const dealsQuery = isManager
      ? `SELECT COUNT(*) as count FROM deals WHERE is_archived = 0`
      : `SELECT COUNT(*) as count FROM deals WHERE is_archived = 0 AND owner_id = ?`;
    const dealsResult = await get(dealsQuery, ownerParams);
    const totalDeals = dealsResult?.count || 0;

    // Get deals created this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString();

    const newDealsQuery = isManager
      ? `SELECT COUNT(*) as count FROM deals WHERE is_archived = 0 AND created_at >= ?`
      : `SELECT COUNT(*) as count FROM deals WHERE is_archived = 0 AND owner_id = ? AND created_at >= ?`;
    const newDealsParams = isManager ? [weekAgoStr] : [userId, weekAgoStr];
    const newDealsResult = await get(newDealsQuery, newDealsParams);
    const newDealsThisWeek = newDealsResult?.count || 0;

    // Get leads count
    const leadsQuery = isManager
      ? `SELECT COUNT(*) as count FROM leads`
      : `SELECT COUNT(*) as count FROM leads WHERE owner_id = ?`;
    const leadsParams = isManager ? [] : [userId];
    const leadsResult = await get(leadsQuery, leadsParams);
    const totalLeads = leadsResult?.count || 0;

    // Get new leads this week
    const newLeadsQuery = isManager
      ? `SELECT COUNT(*) as count FROM leads WHERE created_at >= ?`
      : `SELECT COUNT(*) as count FROM leads WHERE owner_id = ? AND created_at >= ?`;
    const newLeadsParams = isManager ? [weekAgoStr] : [userId, weekAgoStr];
    const newLeadsResult = await get(newLeadsQuery, newLeadsParams);
    const newLeadsThisWeek = newLeadsResult?.count || 0;

    // Get sales rooms count (not expired)
    const salesRoomsQuery = isManager
      ? `SELECT COUNT(*) as count FROM sales_rooms WHERE is_expired = 0`
      : `SELECT COUNT(*) as count FROM sales_rooms WHERE is_expired = 0 AND created_by = ?`;
    const salesRoomsParams = isManager ? [] : [userId];
    const salesRoomsResult = await get(salesRoomsQuery, salesRoomsParams);
    const totalSalesRooms = salesRoomsResult?.count || 0;

    // Get transcripts count
    const transcriptsQuery = isManager
      ? `SELECT COUNT(*) as count FROM transcripts`
      : `SELECT COUNT(*) as count FROM transcripts WHERE uploaded_by = ?`;
    const transcriptsParams = isManager ? [] : [userId];
    const transcriptsResult = await get(transcriptsQuery, transcriptsParams);
    const totalTranscripts = transcriptsResult?.count || 0;

    // Get pending transcripts (not processed)
    const pendingTranscriptsQuery = isManager
      ? `SELECT COUNT(*) as count FROM transcripts WHERE processed = 0`
      : `SELECT COUNT(*) as count FROM transcripts WHERE uploaded_by = ? AND processed = 0`;
    const pendingTranscriptsResult = await get(pendingTranscriptsQuery, transcriptsParams);
    const pendingTranscripts = pendingTranscriptsResult?.count || 0;

    // Get recent activity from activities table (deal activities)
    const activityQuery = isManager
      ? `SELECT a.id, a.description, a.activity_type as entity_type, a.created_at, u.name as user_name
         FROM activities a
         LEFT JOIN users u ON a.created_by = u.id
         ORDER BY a.created_at DESC
         LIMIT 10`
      : `SELECT a.id, a.description, a.activity_type as entity_type, a.created_at, u.name as user_name
         FROM activities a
         LEFT JOIN users u ON a.created_by = u.id
         WHERE a.created_by = ?
         ORDER BY a.created_at DESC
         LIMIT 10`;
    const activityParams = isManager ? [] : [userId];
    const recentActivity = await all(activityQuery, activityParams);

    // Get deals needing attention (overdue next steps or low health score)
    const today = new Date().toISOString().split('T')[0];
    const attentionQuery = isManager
      ? `SELECT id, company_name, next_step_date, health_score, priority, stage
         FROM deals
         WHERE is_archived = 0
         AND (next_step_date < ? OR health_score < 40)
         ORDER BY next_step_date ASC
         LIMIT 5`
      : `SELECT id, company_name, next_step_date, health_score, priority, stage
         FROM deals
         WHERE is_archived = 0 AND owner_id = ?
         AND (next_step_date < ? OR health_score < 40)
         ORDER BY next_step_date ASC
         LIMIT 5`;
    const attentionParams = isManager ? [today] : [userId, today];
    const dealsNeedingAttention = await all(attentionQuery, attentionParams);

    // Get pipeline value
    const pipelineQuery = isManager
      ? `SELECT SUM(estimated_value) as total FROM deals WHERE is_archived = 0 AND stage NOT IN ('closed_won', 'closed_lost')`
      : `SELECT SUM(estimated_value) as total FROM deals WHERE is_archived = 0 AND owner_id = ? AND stage NOT IN ('closed_won', 'closed_lost')`;
    const pipelineResult = await get(pipelineQuery, ownerParams);
    const pipelineValue = pipelineResult?.total || 0;

    // Get won deals value this month
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    const monthAgoStr = monthAgo.toISOString();

    const wonQuery = isManager
      ? `SELECT SUM(estimated_value) as total FROM deals WHERE stage = 'closed_won' AND updated_at >= ?`
      : `SELECT SUM(estimated_value) as total FROM deals WHERE owner_id = ? AND stage = 'closed_won' AND updated_at >= ?`;
    const wonParams = isManager ? [monthAgoStr] : [userId, monthAgoStr];
    const wonResult = await get(wonQuery, wonParams);
    const wonThisMonth = wonResult?.total || 0;

    res.json({
      stats: {
        deals: {
          total: totalDeals,
          newThisWeek: newDealsThisWeek,
        },
        leads: {
          total: totalLeads,
          newThisWeek: newLeadsThisWeek,
        },
        salesRooms: {
          total: totalSalesRooms,
        },
        transcripts: {
          total: totalTranscripts,
          pending: pendingTranscripts,
        },
        pipeline: {
          value: pipelineValue,
          wonThisMonth: wonThisMonth,
        },
      },
      recentActivity,
      dealsNeedingAttention,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

export default router;
