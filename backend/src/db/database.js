import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists
const dataDir = path.resolve(__dirname, '../../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DATABASE_URL || path.resolve(dataDir, 'salesroom.db');

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
  } else {
    console.log('Connected to SQLite database');
  }
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Run migrations to add any missing columns
db.run('ALTER TABLE users ADD COLUMN notification_preferences TEXT', (err) => {
  // Ignore error if column already exists
  if (err && !err.message.includes('duplicate column')) {
    console.error('Migration error:', err.message);
  }
});

// Add health score calculation columns to deals
db.run('ALTER TABLE deals ADD COLUMN has_decision_maker INTEGER DEFAULT 0', (err) => {
  if (err && !err.message.includes('duplicate column')) {
    console.error('Migration error:', err.message);
  }
});

db.run('ALTER TABLE deals ADD COLUMN has_confirmed_budget INTEGER DEFAULT 0', (err) => {
  if (err && !err.message.includes('duplicate column')) {
    console.error('Migration error:', err.message);
  }
});

// Promisified database methods
export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

export function exec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export default db;
