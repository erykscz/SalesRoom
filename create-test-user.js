const bcrypt = require('./backend/node_modules/bcryptjs');
const { v4: uuidv4 } = require('./backend/node_modules/uuid');
const Database = require('./backend/node_modules/better-sqlite3');

const db = new Database('./data/salesroom.db');

// Create test user with no deals
const userId = uuidv4();
const hashedPassword = bcrypt.hashSync('TestUser123!', 10);

try {
  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(userId, 'testuser@salesroom.local', hashedPassword, 'Test User', 'rep', 1);

  console.log('User created:', userId);
  console.log('Email: testuser@salesroom.local');
  console.log('Password: TestUser123!');
} catch (e) {
  if (e.message.includes('UNIQUE')) {
    console.log('User already exists');
  } else {
    console.log('Error:', e.message);
  }
}

db.close();
