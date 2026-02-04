const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'salesroom.db');
const db = new sqlite3.Database(dbPath);

// Create test user with no deals
const userId = uuidv4();
const hashedPassword = bcrypt.hashSync('TestUser123!', 10);

db.run(`
  INSERT INTO users (id, email, password_hash, name, role, is_active, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`, [userId, 'testuser@salesroom.local', hashedPassword, 'Test User', 'rep', 1], function(err) {
  if (err) {
    if (err.message.includes('UNIQUE')) {
      console.log('User already exists');
    } else {
      console.log('Error:', err.message);
    }
  } else {
    console.log('User created:', userId);
    console.log('Email: testuser@salesroom.local');
    console.log('Password: TestUser123!');
  }
  db.close();
});
