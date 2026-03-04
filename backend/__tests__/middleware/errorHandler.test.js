import { jest } from '@jest/globals';
import { errorHandler } from '../../src/middleware/errorHandler.js';

function createMocks() {
  const req = {};
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('errorHandler middleware', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Suppress console.error during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  test('should return 400 for ValidationError', () => {
    const err = new Error('Field is required');
    err.name = 'ValidationError';
    err.details = ['field1 is required'];

    const { req, res, next } = createMocks();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Validation error',
      details: ['field1 is required'],
    });
  });

  test('should return 401 for JsonWebTokenError', () => {
    const err = new Error('jwt malformed');
    err.name = 'JsonWebTokenError';

    const { req, res, next } = createMocks();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Authentication error',
      message: 'jwt malformed',
    });
  });

  test('should return 401 for TokenExpiredError', () => {
    const err = new Error('jwt expired');
    err.name = 'TokenExpiredError';

    const { req, res, next } = createMocks();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Authentication error',
      message: 'jwt expired',
    });
  });

  test('should return 409 for SQLITE_CONSTRAINT UNIQUE error', () => {
    const err = new Error('UNIQUE constraint failed');
    err.code = 'SQLITE_CONSTRAINT';

    const { req, res, next } = createMocks();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Duplicate entry',
      message: 'A record with this value already exists',
    });
  });

  test('should return 400 for SQLITE_CONSTRAINT FOREIGN KEY error', () => {
    const err = new Error('FOREIGN KEY constraint failed');
    err.code = 'SQLITE_CONSTRAINT';

    const { req, res, next } = createMocks();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Reference error',
      message: 'Referenced record does not exist',
    });
  });

  test('should return custom status from err.status', () => {
    const err = new Error('Not found');
    err.status = 404;

    const { req, res, next } = createMocks();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('should return 500 for generic unhandled errors', () => {
    const err = new Error('Something broke');

    const { req, res, next } = createMocks();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Something broke' })
    );
  });

  test('should return "Internal server error" when err.message is empty', () => {
    const err = new Error();

    const { req, res, next } = createMocks();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Internal server error' })
    );
  });
});
