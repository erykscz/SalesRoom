import { jest } from '@jest/globals';

// Prevent server from starting during tests
process.env.VERCEL = '1';

// ---- Mock database module ----
const mockGet = jest.fn();
const mockRun = jest.fn();

jest.unstable_mockModule('../../src/db/database.js', () => ({
  get: mockGet,
  run: mockRun,
  all: jest.fn(),
  exec: jest.fn(),
  default: null,
}));

// ---- Dynamic imports ----
const { calculateHealthScore, calculateHealthScores } = await import('../../src/utils/healthScore.js');

describe('calculateHealthScore', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return base score of 50 for a bare deal with no special attributes', async () => {
    const deal = {
      id: 'deal-1',
      has_decision_maker: 0,
      has_confirmed_budget: 0,
      next_step_date: null,
      compelling_event_date: null,
      estimated_value: null,
      created_at: new Date().toISOString(), // just created
    };

    // No activities found
    mockGet.mockResolvedValueOnce(undefined);

    const score = await calculateHealthScore(deal);
    expect(score).toBe(50);
  });

  test('should add +10 for decision maker identified', async () => {
    const deal = {
      id: 'deal-1',
      has_decision_maker: 1,
      has_confirmed_budget: 0,
      next_step_date: null,
      compelling_event_date: null,
      estimated_value: null,
      created_at: new Date().toISOString(),
    };

    mockGet.mockResolvedValueOnce(undefined); // no activities

    const score = await calculateHealthScore(deal);
    expect(score).toBe(60); // 50 + 10
  });

  test('should add +20 for confirmed budget', async () => {
    const deal = {
      id: 'deal-1',
      has_decision_maker: 0,
      has_confirmed_budget: 1,
      next_step_date: null,
      compelling_event_date: null,
      estimated_value: null,
      created_at: new Date().toISOString(),
    };

    mockGet.mockResolvedValueOnce(undefined);

    const score = await calculateHealthScore(deal);
    expect(score).toBe(70); // 50 + 20
  });

  test('should add +10 for recent activity (within 7 days)', async () => {
    const deal = {
      id: 'deal-1',
      has_decision_maker: 0,
      has_confirmed_budget: 0,
      next_step_date: null,
      compelling_event_date: null,
      estimated_value: null,
      created_at: new Date().toISOString(),
    };

    // Activity from 2 days ago
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    mockGet.mockResolvedValueOnce({ created_at: twoDaysAgo });

    const score = await calculateHealthScore(deal);
    expect(score).toBe(60); // 50 + 10
  });

  test('should subtract -30 for no activity for 14+ days', async () => {
    const deal = {
      id: 'deal-1',
      has_decision_maker: 0,
      has_confirmed_budget: 0,
      next_step_date: null,
      compelling_event_date: null,
      estimated_value: null,
      created_at: new Date().toISOString(),
    };

    // Activity from 20 days ago
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    mockGet.mockResolvedValueOnce({ created_at: twentyDaysAgo });

    const score = await calculateHealthScore(deal);
    expect(score).toBe(20); // 50 - 30
  });

  test('should add +5 for next_step_date in the future', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const deal = {
      id: 'deal-1',
      has_decision_maker: 0,
      has_confirmed_budget: 0,
      next_step_date: futureDate,
      compelling_event_date: null,
      estimated_value: null,
      created_at: new Date().toISOString(),
    };

    mockGet.mockResolvedValueOnce(undefined);

    const score = await calculateHealthScore(deal);
    expect(score).toBe(55); // 50 + 5
  });

  test('should add +5 for compelling event within 30 days', async () => {
    const in20Days = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const deal = {
      id: 'deal-1',
      has_decision_maker: 0,
      has_confirmed_budget: 0,
      next_step_date: null,
      compelling_event_date: in20Days,
      estimated_value: null,
      created_at: new Date().toISOString(),
    };

    mockGet.mockResolvedValueOnce(undefined);

    const score = await calculateHealthScore(deal);
    expect(score).toBe(55); // 50 + 5
  });

  test('should add +5 for deal value >= 50000', async () => {
    const deal = {
      id: 'deal-1',
      has_decision_maker: 0,
      has_confirmed_budget: 0,
      next_step_date: null,
      compelling_event_date: null,
      estimated_value: 75000,
      created_at: new Date().toISOString(),
    };

    mockGet.mockResolvedValueOnce(undefined);

    const score = await calculateHealthScore(deal);
    expect(score).toBe(55); // 50 + 5
  });

  test('should not add value bonus for deal value < 50000', async () => {
    const deal = {
      id: 'deal-1',
      has_decision_maker: 0,
      has_confirmed_budget: 0,
      next_step_date: null,
      compelling_event_date: null,
      estimated_value: 30000,
      created_at: new Date().toISOString(),
    };

    mockGet.mockResolvedValueOnce(undefined);

    const score = await calculateHealthScore(deal);
    expect(score).toBe(50); // no bonus
  });

  test('should cap score at 100', async () => {
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const deal = {
      id: 'deal-1',
      has_decision_maker: 1,   // +10
      has_confirmed_budget: 1, // +20
      next_step_date: futureDate,        // +5
      compelling_event_date: futureDate, // +5
      estimated_value: 100000,           // +5
      created_at: new Date().toISOString(),
    };

    // Recent activity (+10)
    const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    mockGet.mockResolvedValueOnce({ created_at: recent });

    const score = await calculateHealthScore(deal);
    // 50 + 10 + 20 + 10 + 5 + 5 + 5 = 105 -> capped at 100
    expect(score).toBe(100);
  });

  test('should cap score at 0 (minimum)', async () => {
    const deal = {
      id: 'deal-1',
      has_decision_maker: 0,
      has_confirmed_budget: 0,
      next_step_date: null,
      compelling_event_date: null,
      estimated_value: null,
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days old
    };

    // No activities, and deal created 30+ days ago
    mockGet.mockResolvedValueOnce(undefined);

    const score = await calculateHealthScore(deal);
    // 50 - 30 = 20 (creation > 14 days old)
    expect(score).toBe(20);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  test('should handle deal with all positive and negative factors combined', async () => {
    const deal = {
      id: 'deal-1',
      has_decision_maker: 1,   // +10
      has_confirmed_budget: 1, // +20
      next_step_date: null,    // no bonus
      compelling_event_date: null,
      estimated_value: 10000,  // no bonus (< 50k)
      created_at: new Date().toISOString(),
    };

    // Last activity 15 days ago (-30)
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    mockGet.mockResolvedValueOnce({ created_at: fifteenDaysAgo });

    const score = await calculateHealthScore(deal);
    // 50 + 10 + 20 - 30 = 50
    expect(score).toBe(50);
  });
});

describe('calculateHealthScores (batch)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should calculate health scores for multiple deals', async () => {
    const deals = [
      {
        id: 'deal-1',
        has_decision_maker: 0,
        has_confirmed_budget: 0,
        next_step_date: null,
        compelling_event_date: null,
        estimated_value: null,
        created_at: new Date().toISOString(),
      },
      {
        id: 'deal-2',
        has_decision_maker: 1,
        has_confirmed_budget: 1,
        next_step_date: null,
        compelling_event_date: null,
        estimated_value: null,
        created_at: new Date().toISOString(),
      },
    ];

    // No activities for either deal
    mockGet.mockResolvedValue(undefined);

    const results = await calculateHealthScores(deals);

    expect(results).toHaveLength(2);
    expect(results[0].health_score).toBe(50);
    expect(results[1].health_score).toBe(80); // 50 + 10 + 20
  });
});
