const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'salesroom.db');
const db = new sqlite3.Database(dbPath);

// Create second test user (User B) with no deals
const userId = uuidv4();
const hashedPassword = bcrypt.hashSync('UserB123!', 10);

db.run(`
  INSERT INTO users (id, email, password_hash, name, role, is_active, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`, [userId, 'userb@salesroom.local', hashedPassword, 'User B', 'rep', 1], function(err) {
  if (err) {
    if (err.message.includes('UNIQUE')) {
      console.log('User already exists');
    } else {
      console.log('Error:', err.message);
    }
  } else {
    console.log('User created:', userId);
    console.log('Email: userb@salesroom.local');
    console.log('Password: UserB123!');
  }
  db.close();
});
