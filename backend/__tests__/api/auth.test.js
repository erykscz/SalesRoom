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

// ---- Mock bcryptjs ----
const mockBcryptCompare = jest.fn();
const mockBcryptHash = jest.fn();

jest.unstable_mockModule('bcryptjs', () => ({
  default: {
    compare: mockBcryptCompare,
    hash: mockBcryptHash,
  },
}));

// ---- Mock uuid ----
jest.unstable_mockModule('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

// ---- Dynamic imports after mocks ----
const { default: request } = await import('supertest');
const { default: jwt } = await import('jsonwebtoken');

// Build the Express app by importing index AFTER mocks
const { default: app } = await import('../../src/index.js');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Helper to generate a valid token
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

// Helper to generate an expired token
function generateExpiredToken() {
  return jwt.sign(
    { userId: 'user-123', email: 'test@example.com', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '-1s' }
  );
}

// Mock user data that the auth middleware will look up
const mockActiveUser = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin',
  avatar_url: null,
  is_active: 1,
  password_hash: '$2a$10$hashedpassword',
  phone: null,
  job_title: null,
};

describe('Auth API -- POST /api/auth/login', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'Password1!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email and password are required');
  });

  test('should return 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email and password are required');
  });

  test('should return 400 when both fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email and password are required');
  });

  test('should return 401 for non-existent user', async () => {
    mockGet.mockResolvedValueOnce(undefined); // user not found

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'notexist@example.com', password: 'Password1!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  test('should return 401 for deactivated user', async () => {
    mockGet.mockResolvedValueOnce({ ...mockActiveUser, is_active: 0 });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Password1!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Account is deactivated. Please contact an administrator.');
  });

  test('should return 401 for wrong password', async () => {
    mockGet.mockResolvedValueOnce(mockActiveUser);
    mockBcryptCompare.mockResolvedValueOnce(false); // wrong password

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPassword1!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  test('should return 200 with token and user on successful login', async () => {
    mockGet.mockResolvedValueOnce(mockActiveUser); // user lookup
    mockBcryptCompare.mockResolvedValueOnce(true);  // password OK
    mockRun.mockResolvedValue({ lastID: null, changes: 1 }); // session + audit_log

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Password1!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.user.name).toBe('Test User');
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  test('should trim and lowercase email before lookup', async () => {
    mockGet.mockResolvedValueOnce(undefined);

    await request(app)
      .post('/api/auth/login')
      .send({ email: '  Test@EXAMPLE.com  ', password: 'Password1!' });

    // The first call to mockGet should have the lowercased, trimmed email
    expect(mockGet).toHaveBeenCalledWith(
      expect.any(String),
      ['test@example.com']
    );
  });
});

describe('Auth API -- GET /api/auth/me', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 401 when no token is provided', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('No token provided');
  });

  test('should return 401 for an invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token-here');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid token');
  });

  test('should return 401 for an expired token', async () => {
    const expiredToken = generateExpiredToken();

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token expired');
  });

  test('should return 200 with user data for a valid token', async () => {
    const token = generateToken();
    // Auth middleware calls get() to verify user exists
    mockGet.mockResolvedValueOnce(mockActiveUser);
    // The /me route calls get() again to fetch user details
    mockGet.mockResolvedValueOnce({
      ...mockActiveUser,
      created_at: '2024-01-01T00:00:00.000Z',
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('test@example.com');
    expect(res.body.name).toBe('Test User');
    expect(res.body.role).toBe('admin');
  });
});

describe('Auth API -- POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email is required');
  });

  test('should return 200 even for non-existent user (prevent email enumeration)', async () => {
    mockGet.mockResolvedValueOnce(undefined); // user not found

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('If an account exists');
  });

  test('should return 200 and create reset token for existing user', async () => {
    mockGet.mockResolvedValueOnce({ id: 'user-123', email: 'test@example.com', name: 'Test' });
    mockRun.mockResolvedValueOnce({ lastID: null, changes: 1 });

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('If an account exists');
    // Ensure run was called to insert the reset token
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO password_reset_tokens'),
      expect.any(Array)
    );
  });
});

describe('Auth API -- POST /api/auth/reset-password', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 400 when token is missing', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ password: 'NewPassword1!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Token and password are required');
  });

  test('should return 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'some-token' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Token and password are required');
  });

  test('should return 400 for weak password', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'some-token', password: 'weak' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Password must be at least 8 characters');
  });

  test('should return 400 for invalid/expired reset token', async () => {
    mockGet.mockResolvedValueOnce(undefined); // token not found

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'invalid-token', password: 'NewPassword1!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid or expired reset token');
  });

  test('should return 200 and reset password for valid token', async () => {
    mockGet.mockResolvedValueOnce({ id: 'reset-1', user_id: 'user-123', token: 'valid-token', used: 0 });
    mockBcryptHash.mockResolvedValueOnce('$2a$10$newhash');
    mockRun.mockResolvedValue({ lastID: null, changes: 1 });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'valid-token', password: 'NewPassword1!' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Password has been reset successfully');
  });
});

describe('Auth API -- PUT /api/auth/preferences', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 401 without auth token', async () => {
    const res = await request(app)
      .put('/api/auth/preferences')
      .send({ preferences: { deal_won: true } });

    expect(res.status).toBe(401);
  });

  test('should return 400 for invalid preferences', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser); // auth middleware

    const res = await request(app)
      .put('/api/auth/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: 'not-an-object' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Preferences object is required');
  });

  test('should return 200 and update preferences', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser); // auth middleware
    mockRun.mockResolvedValueOnce({ lastID: null, changes: 1 });

    const res = await request(app)
      .put('/api/auth/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ preferences: { deal_won: true, deal_lost: false } });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Preferences updated successfully');
    expect(res.body.preferences).toHaveProperty('deal_won', true);
    expect(res.body.preferences).toHaveProperty('deal_lost', false);
  });
});

describe('Auth API -- GET /api/auth/master-prompt', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 401 without auth token', async () => {
    const res = await request(app).get('/api/auth/master-prompt');
    expect(res.status).toBe(401);
  });

  test('should return default prompt for user with no master prompt', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser); // auth middleware
    mockGet.mockResolvedValueOnce({ master_prompt: null });  // user prompt

    const res = await request(app)
      .get('/api/auth/master-prompt')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.masterPrompt).toBeNull();
    expect(res.body).toHaveProperty('defaultPrompt');
  });
});

describe('Auth API -- PUT /api/auth/master-prompt', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 400 for non-string master prompt', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser); // auth middleware

    const res = await request(app)
      .put('/api/auth/master-prompt')
      .set('Authorization', `Bearer ${token}`)
      .send({ masterPrompt: 12345 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Master prompt must be a string');
  });

  test('should update master prompt successfully', async () => {
    const token = generateToken();
    mockGet.mockResolvedValueOnce(mockActiveUser); // auth middleware
    mockRun.mockResolvedValueOnce({ lastID: null, changes: 1 });

    const res = await request(app)
      .put('/api/auth/master-prompt')
      .set('Authorization', `Bearer ${token}`)
      .send({ masterPrompt: 'Write in Polish.' });

    expect(res.status).toBe(200);
    expect(res.body.masterPrompt).toBe('Write in Polish.');
  });
});
