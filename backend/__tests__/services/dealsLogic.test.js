import { jest } from '@jest/globals';

// Prevent server from starting during tests
process.env.VERCEL = '1';

// ---- Mock database module ----
const mockGet = jest.fn();
const mockRun = jest.fn();
const mockAll = jest.fn();

jest.unstable_mockModule('../../src/db/database.js', () => ({
  get: mockGet,
  run: mockRun,
  all: mockAll,
  exec: jest.fn(),
  default: null,
}));

// ---- Mock uuid ----
jest.unstable_mockModule('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
}));

// ---- Mock healthScore ----
jest.unstable_mockModule('../../src/utils/healthScore.js', () => ({
  calculateHealthScore: jest.fn(() => 50),
  calculateHealthScores: jest.fn((d) => d),
  updateDealHealthScore: jest.fn(),
}));

// ---- Mock notifications ----
const mockRouterDL = function mockRouterDL(req, res, next) { next(); };
mockRouterDL.get = jest.fn().mockReturnValue(mockRouterDL);
mockRouterDL.post = jest.fn().mockReturnValue(mockRouterDL);
mockRouterDL.put = jest.fn().mockReturnValue(mockRouterDL);
mockRouterDL.delete = jest.fn().mockReturnValue(mockRouterDL);
mockRouterDL.use = jest.fn().mockReturnValue(mockRouterDL);

jest.unstable_mockModule('../../src/routes/notifications.js', () => ({
  default: mockRouterDL,
  createNotification: jest.fn(),
}));

// ---- Dynamic imports ----
const { default: request } = await import('supertest');
const { default: jwt } = await import('jsonwebtoken');
const { default: app } = await import('../../src/index.js');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

function generateToken(payload = {}) {
  return jwt.sign(
    {
      userId: payload.userId || 'user-123',
      email: payload.email || 'test@example.com',
      role: payload.role || 'admin',
    },
    JWT_SECRET,
    { expiresIn: '4h' }
  );
}

const mockActiveUser = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin',
  avatar_url: null,
  is_active: 1,
};

describe('Deals CSV Preview -- POST /api/deals/import/csv/preview', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 400 when csvContent is missing', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);

    const res = await request(app)
      .post('/api/deals/import/csv/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CSV content is required');
  });

  test('should return 400 when CSV has only a header row', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);

    const res = await request(app)
      .post('/api/deals/import/csv/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent: 'Name,Company,Email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('header row and at least one data row');
  });

  test('should detect standard format column mappings', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);

    const csv = 'Name,Company Name,Email,Phone,Industry\nJohn Doe,Acme,john@acme.com,+123,Tech';

    const res = await request(app)
      .post('/api/deals/import/csv/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent: csv });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('headers');
    expect(res.body).toHaveProperty('detectedMappings');
    expect(res.body).toHaveProperty('sampleRows');
    expect(res.body).toHaveProperty('totalRows', 1);
    expect(res.body).toHaveProperty('format', 'standard');
    expect(res.body.headers).toEqual(['Name', 'Company Name', 'Email', 'Phone', 'Industry']);
    expect(res.body.detectedMappings.name).toBe(0);
    expect(res.body.detectedMappings.company_name).toBe(1);
    expect(res.body.detectedMappings.email).toBe(2);
  });

  test('should detect LinkedIn format', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);

    const csv = '"LinkedIn Name","First Name","Last Name","Sales Navigator Profile Link","Organisation"\n"John Doe","John","Doe","https://linkedin.com/in/jd","Acme Corp"';

    const res = await request(app)
      .post('/api/deals/import/csv/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent: csv });

    expect(res.status).toBe(200);
    expect(res.body.format).toBe('linkedin');
  });

  test('should handle CSV with quoted fields correctly', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);

    const csv = 'Name,Company Name,Email\n"Doe, John","Acme, Inc.","john@acme.com"';

    const res = await request(app)
      .post('/api/deals/import/csv/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent: csv });

    expect(res.status).toBe(200);
    expect(res.body.sampleRows[0]).toEqual(['Doe, John', 'Acme, Inc.', 'john@acme.com']);
  });
});

describe('Deals CSV Import -- POST /api/deals/import/csv', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 400 when csvContent is missing', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);

    const res = await request(app)
      .post('/api/deals/import/csv')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CSV content is required');
  });

  test('should successfully import deals from standard CSV', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockRun.mockResolvedValue({ lastID: null, changes: 1 });

    const csv = 'Name,Company Name,Email,Industry\nJohn Doe,Acme,john@acme.com,Tech\nJane Smith,BigCo,jane@big.co,Finance';

    const res = await request(app)
      .post('/api/deals/import/csv')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent: csv });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.imported).toBe(2);
    expect(res.body.deals).toHaveLength(2);
  });
});

describe('Deals Validation Edge Cases', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should accept all valid stages', async () => {
    const validStages = ['new_signal', 'qualified', 'discovery', 'solution_design', 'negotiation', 'closed_won', 'closed_lost'];

    for (const stage of validStages) {
      jest.resetAllMocks();
      const token = generateToken();
      mockGet.mockResolvedValueOnce(mockActiveUser);
      mockRun.mockResolvedValue({ lastID: null, changes: 1 });
      mockGet.mockResolvedValueOnce({ id: 'test-uuid', name: 'Test', stage });

      const res = await request(app)
        .post('/api/deals')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test', stage, next_step_date: '2026-04-01' });

      expect(res.status).toBe(201);
    }
  });

  test('should accept all valid priorities', async () => {
    const validPriorities = ['low', 'medium', 'high'];

    for (const priority of validPriorities) {
      jest.resetAllMocks();
      const token = generateToken();
      mockGet.mockResolvedValueOnce(mockActiveUser);
      mockRun.mockResolvedValue({ lastID: null, changes: 1 });
      mockGet.mockResolvedValueOnce({ id: 'test-uuid', name: 'Test', priority });

      const res = await request(app)
        .post('/api/deals')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test', priority, next_step_date: '2026-04-01' });

      expect(res.status).toBe(201);
    }
  });

  test('should reject company_name longer than 255 chars', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);

    const res = await request(app)
      .post('/api/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test',
        company_name: 'A'.repeat(256),
        next_step_date: '2026-04-01',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Company name must not exceed 255 characters');
  });

  test('should reject industry longer than 100 chars', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);

    const res = await request(app)
      .post('/api/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test',
        industry: 'X'.repeat(101),
        next_step_date: '2026-04-01',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Industry must not exceed 100 characters');
  });

  test('should reject next_step_description longer than 1000 chars', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);

    const res = await request(app)
      .post('/api/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test',
        next_step_date: '2026-04-01',
        next_step_description: 'Y'.repeat(1001),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Next step description must not exceed 1000 characters');
  });
});

describe('Health Check -- GET /api/health', () => {
  test('should return 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('timestamp');
  });
});

describe('404 Handler', () => {
  test('should return 404 for unknown endpoints', async () => {
    const res = await request(app).get('/api/nonexistent-endpoint');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Endpoint not found');
  });
});
