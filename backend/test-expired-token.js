import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Create an expired token (expired 1 hour ago)
const expiredToken = jwt.sign(
  { userId: 'test-user', email: 'test@test.com', role: 'rep' },
  JWT_SECRET,
  { expiresIn: '-1h' }
);

console.log('Expired Token:', expiredToken);
