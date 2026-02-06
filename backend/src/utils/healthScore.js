import { get } from '../db/database.js';

/**
 * Calculate the health score for a deal based on real data attributes
 *
 * Health Score Components:
 * - Base score: 50
 * - Decision Maker identified: +10
 * - Confirmed budget: +20
 * - Recent activity (within 7 days): +10
 * - Meeting scheduled (next_step_date in future): +5
 * - No activity for 14+ days: -30
 * - Compelling event date approaching (within 30 days): +5
 * - Deal value above average: +5
 *
 * Score is capped between 0 and 100
 */
export async function calculateHealthScore(deal) {
  let score = 50; // Base score

  // Decision Maker identified (+10)
  if (deal.has_decision_maker) {
    score += 10;
  }

  // Confirmed budget (+20)
  if (deal.has_confirmed_budget) {
    score += 20;
  }

  // Check last activity date
  const lastActivity = await get(
    `SELECT created_at FROM activities WHERE deal_id = ? ORDER BY created_at DESC LIMIT 1`,
    [deal.id]
  );

  if (lastActivity) {
    const lastActivityDate = new Date(lastActivity.created_at);
    const daysSinceActivity = Math.floor((Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceActivity <= 7) {
      // Recent activity (+10)
      score += 10;
    } else if (daysSinceActivity >= 14) {
      // No activity for 14+ days (-30)
      score -= 30;
    }
  } else {
    // No activities at all - check deal creation date
    const createdDate = new Date(deal.created_at);
    const daysSinceCreation = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceCreation >= 14) {
      score -= 30;
    }
  }

  // Next step date in the future (+5)
  if (deal.next_step_date) {
    const nextStepDate = new Date(deal.next_step_date);
    if (nextStepDate > new Date()) {
      score += 5;
    }
  }

  // Compelling event approaching (+5)
  if (deal.compelling_event_date) {
    const eventDate = new Date(deal.compelling_event_date);
    const daysUntilEvent = Math.floor((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilEvent > 0 && daysUntilEvent <= 30) {
      score += 5;
    }
  }

  // Deal value bonus (+5 if above 50k)
  if (deal.estimated_value && deal.estimated_value >= 50000) {
    score += 5;
  }

  // Cap score between 0 and 100
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate health scores for multiple deals
 */
export async function calculateHealthScores(deals) {
  return Promise.all(deals.map(async (deal) => ({
    ...deal,
    health_score: await calculateHealthScore(deal)
  })));
}

/**
 * Update a deal's stored health score in the database
 */
export async function updateDealHealthScore(dealId) {
  const deal = await get('SELECT * FROM deals WHERE id = ?', [dealId]);
  if (!deal) return null;

  const newScore = await calculateHealthScore(deal);

  // Update the stored health score
  await get('UPDATE deals SET health_score = ? WHERE id = ?', [newScore, dealId]);

  return newScore;
}
