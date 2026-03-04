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
  v4: jest.fn(() => 'deal-uuid-1234'),
}));

// ---- Mock healthScore utility ----
jest.unstable_mockModule('../../src/utils/healthScore.js', () => ({
  calculateHealthScore: jest.fn(() => 50),
  calculateHealthScores: jest.fn((deals) => deals),
  updateDealHealthScore: jest.fn(),
}));

// ---- Mock notifications ----
const mockCreateNotification = jest.fn();
// Express Router is a function; we need to provide a function as default export
const mockRouter = function mockRouter(req, res, next) { next(); };
mockRouter.get = jest.fn().mockReturnValue(mockRouter);
mockRouter.post = jest.fn().mockReturnValue(mockRouter);
mockRouter.put = jest.fn().mockReturnValue(mockRouter);
mockRouter.delete = jest.fn().mockReturnValue(mockRouter);
mockRouter.use = jest.fn().mockReturnValue(mockRouter);

jest.unstable_mockModule('../../src/routes/notifications.js', () => ({
  default: mockRouter,
  createNotification: mockCreateNotification,
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

const sampleDeal = {
  id: 'deal-uuid-1234',
  name: 'John Doe',
  job_title: 'CTO',
  email: 'john@company.com',
  phone: '+1234567890',
  linkedin_url: 'https://linkedin.com/in/johndoe',
  company_name: 'Acme Corp',
  company_url: 'https://acme.com',
  industry: 'Technology',
  stage: 'new_signal',
  estimated_value: 50000,
  close_date: '2026-06-01',
  next_step_date: '2026-04-01',
  next_step_description: 'Schedule demo',
  health_score: 50,
  owner_id: 'user-123',
  owner_name: 'Test User',
  owner_email: 'test@example.com',
  priority: 'medium',
  is_archived: 0,
  source: 'manual',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('Deals API -- POST /api/deals', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/deals')
      .send({ name: 'Test Deal', next_step_date: '2026-04-01' });

    expect(res.status).toBe(401);
  });

  test('should return 400 when name is missing', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);

    const res = await request(app)
      .post('/api/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({ company_name: 'Acme Corp', next_step_date: '2026-04-01' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Name is required');
  });

  test('should return 400 when next_step_date is missing', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);

    const res = await request(app)
      .post('/api/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'John Doe', company_name: 'Acme Corp' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Next step date is required');
  });

  test('should return 400 for company_name shorter than 2 characters', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);

    const res = await request(app)
      .post('/api/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'John Doe', company_name: 'A', next_step_date: '2026-04-01' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Company name must be at least 2 characters');
  });

  test('should return 400 for invalid stage', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);

    const res = await request(app)
      .post('/api/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'John Doe', stage: 'invalid_stage', next_step_date: '2026-04-01' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid stage');
  });

  test('should return 400 for invalid priority', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);

    const res = await request(app)
      .post('/api/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'John Doe', priority: 'urgent', next_step_date: '2026-04-01' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid priority');
  });

  test('should return 201 on successful deal creation', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser); // auth middleware
    mockRun.mockResolvedValue({ lastID: null, changes: 1 }); // INSERT deals + INSERT activities
    mockGet.mockResolvedValueOnce(sampleDeal); // fetch created deal

    const res = await request(app)
      .post('/api/deals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'John Doe',
        company_name: 'Acme Corp',
        industry: 'Technology',
        next_step_date: '2026-04-01',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('deal');
    expect(res.body).toHaveProperty('message', 'Deal created successfully');
    expect(res.body.deal.name).toBe('John Doe');
  });
});

describe('Deals API -- GET /api/deals', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 401 without auth token', async () => {
    const res = await request(app).get('/api/deals');
    expect(res.status).toBe(401);
  });

  test('should return 200 with deals list and pagination', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser); // auth middleware
    mockGet.mockResolvedValueOnce({ total: 1 }); // count query
    mockAll.mockResolvedValueOnce([sampleDeal]);  // deals query

    const res = await request(app)
      .get('/api/deals')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('deals');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.pagination).toHaveProperty('page', 1);
    expect(res.body.pagination).toHaveProperty('total', 1);
    expect(Array.isArray(res.body.deals)).toBe(true);
  });

  test('should support stage filter query param', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce({ total: 0 });
    mockAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/deals?stage=qualified')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('stage = ?'),
      expect.arrayContaining(['qualified'])
    );
  });
});

describe('Deals API -- GET /api/deals/:id', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 401 without auth token', async () => {
    const res = await request(app).get('/api/deals/deal-uuid-1234');
    expect(res.status).toBe(401);
  });

  test('should return 404 when deal is not found', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .get('/api/deals/nonexistent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Deal not found');
  });

  test('should return 403 when non-owner rep tries to access deal', async () => {
    const token = generateToken({ userId: 'other-user', role: 'rep' });
    const repUser = { ...mockActiveUser, id: 'other-user', role: 'rep' };
    mockGet.mockResolvedValueOnce(repUser);
    mockGet.mockResolvedValueOnce({ ...sampleDeal, owner_id: 'user-123' });

    const res = await request(app)
      .get('/api/deals/deal-uuid-1234')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Access denied');
  });

  test('should return 200 with deal, activities, transcripts, and salesRoom', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(sampleDeal);
    mockAll.mockResolvedValueOnce([]); // activities
    mockAll.mockResolvedValueOnce([]); // transcripts
    mockGet.mockResolvedValueOnce(null); // salesRoom

    const res = await request(app)
      .get('/api/deals/deal-uuid-1234')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('deal');
    expect(res.body).toHaveProperty('activities');
    expect(res.body).toHaveProperty('transcripts');
    expect(res.body.deal.name).toBe('John Doe');
  });
});

describe('Deals API -- PUT /api/deals/:id', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 401 without auth token', async () => {
    const res = await request(app)
      .put('/api/deals/deal-uuid-1234')
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(401);
  });

  test('should return 404 when deal does not exist', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .put('/api/deals/nonexistent-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Deal not found');
  });

  test('should return 400 when no fields are provided', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(sampleDeal);

    const res = await request(app)
      .put('/api/deals/deal-uuid-1234')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No fields to update');
  });

  test('should return 400 for empty name', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(sampleDeal);

    const res = await request(app)
      .put('/api/deals/deal-uuid-1234')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Name cannot be empty');
  });

  test('should return 400 for invalid stage value', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(sampleDeal);

    const res = await request(app)
      .put('/api/deals/deal-uuid-1234')
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'not_a_stage' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid stage');
  });

  test('should return 400 for invalid health_score', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(sampleDeal);

    const res = await request(app)
      .put('/api/deals/deal-uuid-1234')
      .set('Authorization', `Bearer ${token}`)
      .send({ health_score: 150 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Health score must be between 0 and 100');
  });

  test('should return 200 on successful update', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(sampleDeal);
    mockRun.mockResolvedValue({ lastID: null, changes: 1 });
    mockGet.mockResolvedValueOnce({ ...sampleDeal, name: 'Updated Name' });

    const res = await request(app)
      .put('/api/deals/deal-uuid-1234')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('deal');
    expect(res.body).toHaveProperty('message', 'Deal updated successfully');
  });

  test('should return 403 when non-admin non-owner tries to update', async () => {
    const token = generateToken({ userId: 'other-user', role: 'rep' });
    const repUser = { ...mockActiveUser, id: 'other-user', role: 'rep' };
    mockGet.mockResolvedValueOnce(repUser);
    mockGet.mockResolvedValueOnce(sampleDeal);

    const res = await request(app)
      .put('/api/deals/deal-uuid-1234')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hijacked' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Access denied');
  });
});

describe('Deals API -- DELETE /api/deals/:id', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 401 without auth token', async () => {
    const res = await request(app).delete('/api/deals/deal-uuid-1234');
    expect(res.status).toBe(401);
  });

  test('should return 404 for non-existent deal', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .delete('/api/deals/nonexistent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Deal not found');
  });

  test('should return 403 when non-owner non-admin tries to delete', async () => {
    const token = generateToken({ userId: 'other-user', role: 'rep' });
    const repUser = { ...mockActiveUser, id: 'other-user', role: 'rep' };
    mockGet.mockResolvedValueOnce(repUser);
    mockGet.mockResolvedValueOnce(sampleDeal);

    const res = await request(app)
      .delete('/api/deals/deal-uuid-1234')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Access denied');
  });

  test('should return 200 on successful deletion by owner', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(sampleDeal);
    mockRun.mockResolvedValueOnce({ lastID: null, changes: 1 });

    const res = await request(app)
      .delete('/api/deals/deal-uuid-1234')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Deal deleted successfully');
  });
});

describe('Deals API -- POST /api/deals/:id/transfer', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 400 when newOwnerId is missing', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);

    const res = await request(app)
      .post('/api/deals/deal-uuid-1234/transfer')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('New owner ID is required');
  });

  test('should return 404 when deal does not exist', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/api/deals/nonexistent/transfer')
      .set('Authorization', `Bearer ${token}`)
      .send({ newOwnerId: 'new-user-id' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Deal not found');
  });
});

describe('Deals API -- POST /api/deals/:id/notes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 400 when note content is missing', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce({ id: 'deal-uuid-1234' });

    const res = await request(app)
      .post('/api/deals/deal-uuid-1234/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Note content is required');
  });

  test('should return 404 when deal does not exist', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/api/deals/nonexistent/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'A note' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Deal not found');
  });

  test('should return 201 on successful note creation', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockGet.mockResolvedValueOnce({ id: 'deal-uuid-1234' });
    mockRun.mockResolvedValueOnce({ lastID: null, changes: 1 });
    mockGet.mockResolvedValueOnce({
      id: 'deal-uuid-1234',
      deal_id: 'deal-uuid-1234',
      activity_type: 'note',
      description: 'A test note',
      created_by: 'user-123',
      created_by_name: 'Test User',
    });

    const res = await request(app)
      .post('/api/deals/deal-uuid-1234/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'A test note' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('note');
    expect(res.body.message).toBe('Note added successfully');
  });
});
