import { jest } from '@jest/globals';

// ---- Mock database module ----
const mockGet = jest.fn();

jest.unstable_mockModule('../../src/db/database.js', () => ({
  get: mockGet,
  run: jest.fn(),
  all: jest.fn(),
  exec: jest.fn(),
  default: null,
}));

// ---- Dynamic imports ----
const { default: jwt } = await import('jsonwebtoken');
const { authMiddleware, requireRole, requireManagerOrAbove, requireAdmin } = await import('../../src/middleware/auth.js');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Helper to create mock req/res/next
function createMocks(headers = {}) {
  const req = {
    headers: headers,
    user: null,
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('authMiddleware', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('should return 401 if no Authorization header', async () => {
    const { req, res, next } = createMocks({});

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 if Authorization header does not start with Bearer', async () => {
    const { req, res, next } = createMocks({ authorization: 'Basic abc123' });

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'No token provided' });
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 for invalid JWT token', async () => {
    const { req, res, next } = createMocks({ authorization: 'Bearer invalid.token.here' });

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 for expired JWT token', async () => {
    const expiredToken = jwt.sign(
      { userId: 'user-123', email: 'test@example.com', role: 'admin' },
      JWT_SECRET,
      { expiresIn: '-1s' }
    );

    const { req, res, next } = createMocks({ authorization: `Bearer ${expiredToken}` });

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token expired' });
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 if user is not found in database', async () => {
    const token = jwt.sign(
      { userId: 'user-123', email: 'test@example.com', role: 'admin' },
      JWT_SECRET,
      { expiresIn: '4h' }
    );

    mockGet.mockResolvedValueOnce(undefined); // user not found

    const { req, res, next } = createMocks({ authorization: `Bearer ${token}` });

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 401 if user account is deactivated', async () => {
    const token = jwt.sign(
      { userId: 'user-123', email: 'test@example.com', role: 'admin' },
      JWT_SECRET,
      { expiresIn: '4h' }
    );

    mockGet.mockResolvedValueOnce({
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test',
      role: 'admin',
      avatar_url: null,
      is_active: 0, // deactivated
    });

    const { req, res, next } = createMocks({ authorization: `Bearer ${token}` });

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'User account is deactivated' });
    expect(next).not.toHaveBeenCalled();
  });

  test('should call next() and attach user to req for valid token and active user', async () => {
    const token = jwt.sign(
      { userId: 'user-123', email: 'test@example.com', role: 'admin' },
      JWT_SECRET,
      { expiresIn: '4h' }
    );

    const activeUser = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'admin',
      avatar_url: null,
      is_active: 1,
    };
    mockGet.mockResolvedValueOnce(activeUser);

    const { req, res, next } = createMocks({ authorization: `Bearer ${token}` });

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'admin',
      avatarUrl: null,
    });
  });
});

describe('requireRole middleware', () => {
  test('should return 401 if req.user is not set', () => {
    const middleware = requireRole('admin', 'manager');
    const { req, res, next } = createMocks();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 403 if user role is not in allowed list', () => {
    const middleware = requireRole('admin', 'manager');
    const { req, res, next } = createMocks();
    req.user = { id: 'user-123', role: 'rep' };

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Access denied. Insufficient permissions.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('should call next() if user role is in allowed list', () => {
    const middleware = requireRole('admin', 'manager');
    const { req, res, next } = createMocks();
    req.user = { id: 'user-123', role: 'admin' };

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('requireManagerOrAbove middleware', () => {
  test('should return 401 if req.user is not set', () => {
    const { req, res, next } = createMocks();

    requireManagerOrAbove(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 403 for rep role', () => {
    const { req, res, next } = createMocks();
    req.user = { id: 'user-123', role: 'rep' };

    requireManagerOrAbove(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('should call next() for manager role', () => {
    const { req, res, next } = createMocks();
    req.user = { id: 'user-123', role: 'manager' };

    requireManagerOrAbove(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('should call next() for admin role', () => {
    const { req, res, next } = createMocks();
    req.user = { id: 'user-123', role: 'admin' };

    requireManagerOrAbove(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('requireAdmin middleware', () => {
  test('should return 401 if req.user is not set', () => {
    const { req, res, next } = createMocks();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('should return 403 for non-admin roles', () => {
    const { req, res, next } = createMocks();
    req.user = { id: 'user-123', role: 'manager' };

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
    expect(next).not.toHaveBeenCalled();
  });

  test('should call next() for admin role', () => {
    const { req, res, next } = createMocks();
    req.user = { id: 'user-123', role: 'admin' };

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
