import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect database mode
const DATABASE_URL = process.env.DATABASE_URL || path.resolve(__dirname, '../../../data/salesroom.db');
const isPostgres = DATABASE_URL.startsWith('postgres');

// ─── SQL CONVERSION HELPERS ──────────────────────────────────────────

function convertPlaceholders(sql) {
  if (!isPostgres) return sql;
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

function convertSQL(sql) {
  if (!isPostgres) return sql;

  let converted = sql;

  // datetime('now') / datetime("now") → NOW()
  converted = converted.replace(/datetime\s*\(\s*['"]now['"]\s*\)/gi, 'NOW()');

  // DATE('now') → CURRENT_DATE
  converted = converted.replace(/DATE\s*\(\s*'now'\s*\)/gi, 'CURRENT_DATE');

  // DATE('now', '-N days') → CURRENT_DATE - INTERVAL 'N days'
  converted = converted.replace(
    /DATE\s*\(\s*'now'\s*,\s*'(-?\d+)\s+days?'\s*\)/gi,
    (_, days) => {
      const absDays = Math.abs(parseInt(days));
      const sign = parseInt(days) < 0 ? '-' : '+';
      return `CURRENT_DATE ${sign} INTERVAL '${absDays} days'`;
    }
  );

  // LIKE → ILIKE for case-insensitive search
  converted = converted.replace(/\bLIKE\b/g, 'ILIKE');

  // INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
  if (/INSERT\s+OR\s+IGNORE/i.test(converted)) {
    converted = converted.replace(/INSERT\s+OR\s+IGNORE/gi, 'INSERT');
    converted = converted.trimEnd() + ' ON CONFLICT DO NOTHING';
  }

  return convertPlaceholders(converted);
}

// ─── SQLITE MODE ─────────────────────────────────────────────────────

let db = null;

async function initSQLite() {
  if (db) return db;

  const sqlite3 = (await import('sqlite3')).default;
  const dbPath = DATABASE_URL;

  // Ensure directory exists
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error connecting to database:', err.message);
        reject(err);
      } else {
        console.log('Connected to SQLite database');
        db.run('PRAGMA foreign_keys = ON');
        runSQLiteMigrations(db);
        resolve(db);
      }
    });
  });
}

function runSQLiteMigrations(db) {
  // Existing migrations — only for SQLite
  db.run('ALTER TABLE users ADD COLUMN notification_preferences TEXT', (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Migration error:', err.message);
    }
  });

  db.exec(`
    CREATE TABLE IF NOT EXISTS research_profiles (
      id TEXT PRIMARY KEY,
      lead_id TEXT,
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
      lead_id TEXT,
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
      lead_id TEXT,
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
    if (err) console.error('Deep Research migration error:', err.message);
  });

  ['research_profiles', 'social_profiles', 'generated_messages'].forEach(table => {
    db.run(`ALTER TABLE ${table} ADD COLUMN deal_id TEXT REFERENCES deals(id) ON DELETE CASCADE`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error(`Migration error (${table}.deal_id):`, err.message);
      }
    });
  });

  ['attachment_filename', 'attachment_path', 'attachment_mimetype'].forEach(col => {
    db.run(`ALTER TABLE sales_rooms ADD COLUMN ${col} TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error(`Migration error (sales_rooms.${col}):`, err.message);
      }
    });
  });

  db.run('ALTER TABLE sales_rooms ADD COLUMN attachment_size INTEGER', (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Migration error (sales_rooms.attachment_size):', err.message);
    }
  });

  ['phone', 'job_title'].forEach(col => {
    db.run(`ALTER TABLE users ADD COLUMN ${col} TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error(`Migration error (users.${col}):`, err.message);
      }
    });
  });

  db.run('ALTER TABLE deals ADD COLUMN company_url TEXT', (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Migration error (deals.company_url):', err.message);
    }
  });

  // Migrate knowledge_base to support 'document' type
  db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='knowledge_base'", (err, row) => {
    if (err || !row) return;
    if (row.sql && !row.sql.includes("'document'")) {
      console.log('Migrating knowledge_base table to add document type...');
      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS knowledge_base_new (
          id TEXT PRIMARY KEY,
          type TEXT CHECK(type IN ('case_study', 'faq', 'competitor_sheet', 'offer_template', 'document')) NOT NULL,
          title TEXT NOT NULL,
          content TEXT,
          file_url TEXT,
          tags TEXT,
          is_shared INTEGER DEFAULT 1,
          created_by TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (created_by) REFERENCES users(id)
        )`);
        db.run(`INSERT INTO knowledge_base_new SELECT * FROM knowledge_base`);
        db.run(`DROP TABLE knowledge_base`);
        db.run(`ALTER TABLE knowledge_base_new RENAME TO knowledge_base`);
        console.log('knowledge_base migration complete');
      });
    }
  });

  db.run('CREATE INDEX IF NOT EXISTS idx_research_profiles_deal ON research_profiles(deal_id)', () => {});
  db.run('CREATE INDEX IF NOT EXISTS idx_social_profiles_deal ON social_profiles(deal_id)', () => {});
  db.run('CREATE INDEX IF NOT EXISTS idx_generated_messages_deal ON generated_messages(deal_id)', () => {});
}

// ─── NEON POSTGRESQL MODE ────────────────────────────────────────────

let neonSql = null;

async function initNeon() {
  if (neonSql) return neonSql;

  const { neon } = await import('@neondatabase/serverless');
  neonSql = neon(DATABASE_URL);
  console.log('Connected to Neon PostgreSQL');
  return neonSql;
}

// ─── UNIFIED DATABASE INTERFACE ──────────────────────────────────────

// Initialize on first call (lazy)
let initialized = false;
async function ensureInit() {
  if (initialized) return;
  initialized = true;
  if (isPostgres) {
    await initNeon();
  } else {
    await initSQLite();
  }
}

/**
 * Execute an INSERT, UPDATE, DELETE statement.
 * Returns { lastID, changes }
 */
export async function run(sql, params = []) {
  await ensureInit();

  if (isPostgres) {
    const converted = convertSQL(sql);
    const result = await neonSql.query(converted, params);
    return {
      lastID: null,
      changes: result.length !== undefined ? result.length : 0
    };
  } else {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
}

/**
 * Fetch a single row. Returns the row object or undefined.
 */
export async function get(sql, params = []) {
  await ensureInit();

  if (isPostgres) {
    const converted = convertSQL(sql);
    const result = await neonSql.query(converted, params);
    return result?.rows?.[0] || undefined;
  } else {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
}

/**
 * Fetch all matching rows. Returns an array.
 */
export async function all(sql, params = []) {
  await ensureInit();

  if (isPostgres) {
    const converted = convertSQL(sql);
    const result = await neonSql.query(converted, params);
    return result?.rows || [];
  } else {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

/**
 * Execute raw SQL (multiple statements for SQLite, single for Neon).
 */
export async function exec(sql) {
  await ensureInit();

  if (isPostgres) {
    // Neon doesn't support multi-statement; split first, then convert each individually
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      await neonSql.query(convertSQL(stmt));
    }
  } else {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

// For backward compatibility — returns the raw SQLite db in dev, null in production
export default db;
