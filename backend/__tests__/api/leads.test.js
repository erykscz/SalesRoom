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
  v4: jest.fn(() => 'lead-uuid-1234'),
}));

// ---- Mock healthScore (required by deals route, imported at app load) ----
jest.unstable_mockModule('../../src/utils/healthScore.js', () => ({
  calculateHealthScore: jest.fn(() => 50),
  calculateHealthScores: jest.fn((deals) => deals),
  updateDealHealthScore: jest.fn(),
}));

// ---- Mock notifications ----
const mockRouterLeads = function mockRouterLeads(req, res, next) { next(); };
mockRouterLeads.get = jest.fn().mockReturnValue(mockRouterLeads);
mockRouterLeads.post = jest.fn().mockReturnValue(mockRouterLeads);
mockRouterLeads.put = jest.fn().mockReturnValue(mockRouterLeads);
mockRouterLeads.delete = jest.fn().mockReturnValue(mockRouterLeads);
mockRouterLeads.use = jest.fn().mockReturnValue(mockRouterLeads);

jest.unstable_mockModule('../../src/routes/notifications.js', () => ({
  default: mockRouterLeads,
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

const sampleLead = {
  id: 'lead-uuid-1234',
  name: 'Jane Smith',
  job_title: 'VP of Sales',
  email: 'jane@company.com',
  phone: '+1987654321',
  linkedin_url: 'https://linkedin.com/in/janesmith',
  company_name: 'BigCo',
  industry: 'Finance',
  tech_stack: '["React","Node.js"]',
  identified_pain: 'Manual sales process',
  confidence_score: 75,
  source_link: 'https://example.com',
  status: 'new',
  owner_id: 'user-123',
  owner_name: 'Test User',
  notes: 'Promising lead',
  deal_id: null,
  hook_suggestions: null,
  competitor_info: null,
  trigger_events: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('Leads API -- POST /api/leads', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/leads')
      .send({ name: 'Test Lead' });

    expect(res.status).toBe(401);
  });

  test('should return 400 when name is missing', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);

    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ company_name: 'BigCo' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Name is required');
  });

  test('should return 201 on successful lead creation', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockRun.mockResolvedValueOnce({ lastID: null, changes: 1 });
    mockGet.mockResolvedValueOnce(sampleLead);

    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Jane Smith',
        company_name: 'BigCo',
        industry: 'Finance',
        tech_stack: ['React', 'Node.js'],
        confidence_score: 75,
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Jane Smith');
    expect(res.body.company_name).toBe('BigCo');
  });

  test('should create lead with minimal data (only name)', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockRun.mockResolvedValueOnce({ lastID: null, changes: 1 });
    mockGet.mockResolvedValueOnce({ ...sampleLead, company_name: null, industry: null });

    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Simple Lead' });

    expect(res.status).toBe(201);
  });
});

describe('Leads API -- GET /api/leads', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 401 without auth token', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(401);
  });

  test('should return 200 with list of leads', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockAll.mockResolvedValueOnce([sampleLead]);

    const res = await request(app)
      .get('/api/leads')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Jane Smith');
    expect(Array.isArray(res.body[0].tech_stack)).toBe(true);
  });

  test('should return empty array when no leads exist', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/leads')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('should support search query param', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/leads?search=BigCo')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mockAll).toHaveBeenCalledWith(
      expect.stringContaining('LIKE'),
      expect.arrayContaining(['%BigCo%'])
    );
  });

  test('should support status filter', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/leads?status=new')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mockAll).toHaveBeenCalledWith(
      expect.stringContaining('status = ?'),
      expect.arrayContaining(['new'])
    );
  });
});

describe('Leads API -- GET /api/leads/:id', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 401 without auth token', async () => {
    const res = await request(app).get('/api/leads/lead-uuid-1234');
    expect(res.status).toBe(401);
  });

  test('should return 404 when lead is not found', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .get('/api/leads/nonexistent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Lead not found');
  });

  test('should return 404 when non-owner rep tries to access lead', async () => {
    const token = generateToken({ userId: 'other-user', role: 'rep' });
    const repUser = { ...mockActiveUser, id: 'other-user', role: 'rep' };
    mockGet.mockResolvedValueOnce(repUser);
    mockGet.mockResolvedValueOnce({ ...sampleLead, owner_id: 'user-123' });

    const res = await request(app)
      .get('/api/leads/lead-uuid-1234')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Lead not found');
  });

  test('should return 200 with lead data for owner', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(sampleLead);

    const res = await request(app)
      .get('/api/leads/lead-uuid-1234')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Jane Smith');
    expect(Array.isArray(res.body.tech_stack)).toBe(true);
  });
});

describe('Leads API -- PUT /api/leads/:id', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 401 without auth token', async () => {
    const res = await request(app)
      .put('/api/leads/lead-uuid-1234')
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(401);
  });

  test('should return 404 when lead does not exist', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .put('/api/leads/nonexistent-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Lead not found');
  });

  test('should return 400 for empty name', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(sampleLead);

    const res = await request(app)
      .put('/api/leads/lead-uuid-1234')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Name cannot be empty');
  });

  test('should return 403 when non-admin non-owner tries to update', async () => {
    const token = generateToken({ userId: 'other-user', role: 'rep' });
    const repUser = { ...mockActiveUser, id: 'other-user', role: 'rep' };
    mockGet.mockResolvedValueOnce(repUser);
    mockGet.mockResolvedValueOnce(sampleLead);

    const res = await request(app)
      .put('/api/leads/lead-uuid-1234')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hijacked' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Not authorized');
  });

  test('should return 200 on successful update', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(sampleLead);
    mockRun.mockResolvedValueOnce({ lastID: null, changes: 1 });
    mockGet.mockResolvedValueOnce({ ...sampleLead, name: 'Updated Jane' });

    const res = await request(app)
      .put('/api/leads/lead-uuid-1234')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Jane' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Jane');
  });
});

describe('Leads API -- DELETE /api/leads/:id', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 401 without auth token', async () => {
    const res = await request(app).delete('/api/leads/lead-uuid-1234');
    expect(res.status).toBe(401);
  });

  test('should return 404 for non-existent lead', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .delete('/api/leads/nonexistent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Lead not found');
  });

  test('should return 403 for non-admin non-owner', async () => {
    const token = generateToken({ userId: 'other-user', role: 'rep' });
    const repUser = { ...mockActiveUser, id: 'other-user', role: 'rep' };
    mockGet.mockResolvedValueOnce(repUser);
    mockGet.mockResolvedValueOnce(sampleLead);

    const res = await request(app)
      .delete('/api/leads/lead-uuid-1234')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Not authorized');
  });

  test('should return 200 on successful deletion', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(sampleLead);
    mockRun.mockResolvedValueOnce({ lastID: null, changes: 1 });

    const res = await request(app)
      .delete('/api/leads/lead-uuid-1234')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Lead deleted successfully');
  });
});

describe('Leads API -- POST /api/leads/:id/convert-to-deal', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 401 without auth token', async () => {
    const res = await request(app).post('/api/leads/lead-uuid-1234/convert-to-deal');
    expect(res.status).toBe(401);
  });

  test('should return 404 when lead does not exist', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/api/leads/nonexistent/convert-to-deal')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Lead not found');
  });

  test('should return 400 when lead is already converted', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce({ ...sampleLead, deal_id: 'existing-deal-id' });

    const res = await request(app)
      .post('/api/leads/lead-uuid-1234/convert-to-deal')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Lead already converted to a deal');
  });

  test('should return 201 on successful conversion', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(sampleLead);
    mockRun.mockResolvedValue({ lastID: null, changes: 1 });
    mockGet.mockResolvedValueOnce({ id: 'lead-uuid-1234', name: 'Jane Smith', company_name: 'BigCo', stage: 'qualified' });

    const res = await request(app)
      .post('/api/leads/lead-uuid-1234/convert-to-deal')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Lead converted to deal successfully');
    expect(res.body).toHaveProperty('deal');
  });

  test('should return 403 when non-admin non-owner tries to convert', async () => {
    const token = generateToken({ userId: 'other-user', role: 'rep' });
    const repUser = { ...mockActiveUser, id: 'other-user', role: 'rep' };
    mockGet.mockResolvedValueOnce(repUser);
    mockGet.mockResolvedValueOnce(sampleLead);

    const res = await request(app)
      .post('/api/leads/lead-uuid-1234/convert-to-deal')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Not authorized');
  });
});
