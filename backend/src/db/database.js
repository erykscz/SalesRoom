import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine database path
const dbPath = process.env.DATABASE_URL || path.resolve(__dirname, '../../../data/salesroom.db');

// Ensure the directory for the database file exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

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

// Deep Research module tables
db.exec(`
  CREATE TABLE IF NOT EXISTS research_profiles (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    status TEXT CHECK(status IN ('pending', 'running', 'completed', 'partial', 'failed')) DEFAULT 'pending',
    linkedin_data TEXT,
    twitter_data TEXT,
    github_data TEXT,
    reddit_data TEXT,
    facebook_data TEXT,
    tavily_data TEXT,
    research_summary TEXT,
    platforms_searched TEXT,
    platforms_succeeded TEXT,
    error_log TEXT,
    requested_by TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS social_profiles (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    research_profile_id TEXT NOT NULL,
    platform TEXT CHECK(platform IN ('linkedin', 'twitter', 'github', 'reddit', 'facebook')) NOT NULL,
    profile_url TEXT,
    username TEXT,
    display_name TEXT,
    bio TEXT,
    followers_count INTEGER,
    profile_data TEXT,
    fetched_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (research_profile_id) REFERENCES research_profiles(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS generated_messages (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    research_profile_id TEXT,
    channel TEXT CHECK(channel IN ('cold_email', 'linkedin_inmail', 'linkedin_connection', 'twitter_dm', 'generic')) NOT NULL,
    tone TEXT CHECK(tone IN ('formal', 'casual', 'provocative', 'consultative')) NOT NULL,
    subject_line TEXT,
    message_body TEXT NOT NULL,
    message_length INTEGER,
    prompt_used TEXT,
    model_used TEXT,
    is_favorite INTEGER DEFAULT 0,
    generated_by TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (research_profile_id) REFERENCES research_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (generated_by) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_research_profiles_lead ON research_profiles(lead_id);
  CREATE INDEX IF NOT EXISTS idx_social_profiles_lead ON social_profiles(lead_id);
  CREATE INDEX IF NOT EXISTS idx_social_profiles_platform ON social_profiles(platform);
  CREATE INDEX IF NOT EXISTS idx_generated_messages_lead ON generated_messages(lead_id);
  CREATE INDEX IF NOT EXISTS idx_generated_messages_channel ON generated_messages(channel);
`, (err) => {
  if (err) {
    console.error('Deep Research migration error:', err.message);
  }
});

// Add deal_id support to research tables (allows research on deals, not just leads)
['research_profiles', 'social_profiles', 'generated_messages'].forEach(table => {
  db.run(`ALTER TABLE ${table} ADD COLUMN deal_id TEXT REFERENCES deals(id) ON DELETE CASCADE`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error(`Migration error (${table}.deal_id):`, err.message);
    }
  });
});

// Make lead_id nullable (research can be for a deal without a lead)
// SQLite doesn't support ALTER COLUMN, so we just ensure new inserts work with NULL lead_id

// Add indexes for deal_id
db.run('CREATE INDEX IF NOT EXISTS idx_research_profiles_deal ON research_profiles(deal_id)', () => {});
db.run('CREATE INDEX IF NOT EXISTS idx_social_profiles_deal ON social_profiles(deal_id)', () => {});
db.run('CREATE INDEX IF NOT EXISTS idx_generated_messages_deal ON generated_messages(deal_id)', () => {});

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
