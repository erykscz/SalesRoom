import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const DATABASE_URL = process.env.DATABASE_URL || path.resolve(__dirname, '../../../data/salesroom.db');
const isPostgres = DATABASE_URL.startsWith('postgres');

// ─── SQL CONVERSION (PostgreSQL compatibility) ─────────────────────────

function convertSQL(sql) {
  if (!isPostgres) return sql;
  let converted = sql;

  // datetime('now') → NOW()
  converted = converted.replace(/datetime\s*\(\s*['"]now['"]\s*\)/gi, 'NOW()');

  // INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
  if (/INSERT\s+OR\s+IGNORE/i.test(converted)) {
    converted = converted.replace(/INSERT\s+OR\s+IGNORE/gi, 'INSERT');
    converted = converted.trimEnd() + ' ON CONFLICT DO NOTHING';
  }

  // Convert ? placeholders to $1, $2, ...
  let idx = 0;
  converted = converted.replace(/\?/g, () => `$${++idx}`);

  return converted;
}

// ─── DATABASE CONNECTION ────────────────────────────────────────────────

let sqliteDb = null;
let neonSql = null;

async function setupConnection() {
  if (isPostgres) {
    const { neon } = await import('@neondatabase/serverless');
    neonSql = neon(DATABASE_URL);
    console.log('Connected to Neon PostgreSQL');
  } else {
    const sqlite3 = (await import('sqlite3')).default;
    const dataDir = path.dirname(DATABASE_URL);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    sqliteDb = await new Promise((resolve, reject) => {
      const conn = new sqlite3.Database(DATABASE_URL, (err) => {
        if (err) reject(err);
        else resolve(conn);
      });
    });
    console.log(`Connected to SQLite: ${DATABASE_URL}`);
  }
}

// ─── SQL HELPERS ────────────────────────────────────────────────────────

async function execMulti(sql) {
  if (isPostgres) {
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      await neonSql(convertSQL(stmt));
    }
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

async function runStmt(sql, params = []) {
  if (isPostgres) {
    await neonSql(convertSQL(sql), params);
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }
}

async function getRow(sql, params = []) {
  if (isPostgres) {
    const rows = await neonSql(convertSQL(sql), params);
    return rows[0] || undefined;
  } else {
    return new Promise((resolve, reject) => {
      sqliteDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
}

async function closeConnection() {
  if (sqliteDb) {
    return new Promise((resolve) => sqliteDb.close(() => resolve()));
  }
}

// ─── MAIN INITIALIZATION ───────────────────────────────────────────────

async function initDatabase() {
  try {
    await setupConnection();

    console.log(`Initializing database (${isPostgres ? 'PostgreSQL' : 'SQLite'})...`);

    // SQLite-only: enable foreign keys
    if (!isPostgres) {
      await execMulti('PRAGMA foreign_keys = ON');
    }

    // ── Create tables (ordered by FK dependencies) ──────────────────

    await execMulti(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT CHECK(role IN ('rep', 'sdr', 'ae', 'manager', 'admin')) DEFAULT 'rep',
        avatar_url TEXT,
        phone TEXT,
        job_title TEXT,
        notification_preferences TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS icp_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        criteria TEXT NOT NULL,
        is_shared INTEGER DEFAULT 0,
        owner_id TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS intent_searches (
        id TEXT PRIMARY KEY,
        mission_objective TEXT NOT NULL,
        icp_template_id TEXT,
        status TEXT CHECK(status IN ('queued', 'running', 'completed', 'failed')) DEFAULT 'queued',
        results_count INTEGER DEFAULT 0,
        owner_id TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        FOREIGN KEY (icp_template_id) REFERENCES icp_templates(id),
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS deals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        job_title TEXT,
        email TEXT,
        phone TEXT,
        linkedin_url TEXT,
        company_name TEXT,
        company_url TEXT,
        industry TEXT,
        stage TEXT CHECK(stage IN ('new_signal', 'qualified', 'discovery', 'solution_design', 'negotiation', 'closed_won', 'closed_lost')) DEFAULT 'new_signal',
        estimated_value REAL,
        close_date TEXT,
        compelling_event_date TEXT,
        next_step_date TEXT NOT NULL,
        next_step_description TEXT,
        health_score INTEGER DEFAULT 50,
        has_decision_maker INTEGER DEFAULT 0,
        has_confirmed_budget INTEGER DEFAULT 0,
        owner_id TEXT NOT NULL,
        source TEXT CHECK(source IN ('intent_scraper', 'manual', 'import')) DEFAULT 'manual',
        priority TEXT CHECK(priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
        lost_reason TEXT,
        is_archived INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        job_title TEXT,
        email TEXT,
        phone TEXT,
        linkedin_url TEXT,
        company_name TEXT,
        industry TEXT,
        tech_stack TEXT,
        identified_pain TEXT,
        confidence_score INTEGER DEFAULT 0,
        source_link TEXT,
        status TEXT CHECK(status IN ('new', 'contacted', 'qualified', 'nurturing', 'not_interested')) DEFAULT 'new',
        search_id TEXT,
        deal_id TEXT,
        owner_id TEXT NOT NULL,
        notes TEXT,
        hook_suggestions TEXT,
        competitor_info TEXT,
        trigger_events TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (search_id) REFERENCES intent_searches(id),
        FOREIGN KEY (deal_id) REFERENCES deals(id),
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS transcripts (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_format TEXT CHECK(file_format IN ('txt', 'json', 'vtt')) DEFAULT 'txt',
        raw_content TEXT NOT NULL,
        cleaned_content TEXT,
        source_platform TEXT CHECK(source_platform IN ('fireflies', 'otter', 'zoom', 'google_meet', 'manual')) DEFAULT 'manual',
        processed INTEGER DEFAULT 0,
        insights TEXT,
        uploaded_by TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        processed_at TEXT,
        FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS sales_rooms (
        id TEXT PRIMARY KEY,
        deal_id TEXT UNIQUE NOT NULL,
        template_type TEXT CHECK(template_type IN ('legacy_modernization', 'cloud_migration', 'staff_augmentation', 'custom')) DEFAULT 'custom',
        public_url_slug TEXT UNIQUE NOT NULL,
        offer_content TEXT,
        sections TEXT,
        chatbot_enabled INTEGER DEFAULT 1,
        video_url TEXT,
        calendly_link TEXT,
        branding TEXT,
        is_expired INTEGER DEFAULT 0,
        expires_at TEXT,
        password_protected INTEGER DEFAULT 0,
        password_hash TEXT,
        mutual_action_plan TEXT,
        poll_enabled INTEGER DEFAULT 0,
        poll_question TEXT,
        attachment_filename TEXT,
        attachment_path TEXT,
        attachment_mimetype TEXT,
        attachment_size INTEGER,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS sales_room_analytics (
        id TEXT PRIMARY KEY,
        sales_room_id TEXT NOT NULL,
        visitor_role TEXT,
        section_viewed TEXT,
        time_spent_seconds INTEGER DEFAULT 0,
        visited_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (sales_room_id) REFERENCES sales_rooms(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chatbot_logs (
        id TEXT PRIMARY KEY,
        sales_room_id TEXT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        asked_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (sales_room_id) REFERENCES sales_rooms(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS poll_responses (
        id TEXT PRIMARY KEY,
        sales_room_id TEXT NOT NULL,
        visitor_role TEXT,
        response TEXT NOT NULL,
        feedback TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (sales_room_id) REFERENCES sales_rooms(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS battlecards (
        id TEXT PRIMARY KEY,
        category TEXT CHECK(category IN ('price', 'technology', 'trust', 'competition', 'timing', 'features')) NOT NULL,
        objection_text TEXT NOT NULL,
        arc_response TEXT NOT NULL,
        case_study_links TEXT,
        is_shared INTEGER DEFAULT 0,
        is_golden_arrow INTEGER DEFAULT 0,
        created_by TEXT NOT NULL,
        feedback_score INTEGER DEFAULT 0,
        use_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS battlecard_feedback (
        id TEXT PRIMARY KEY,
        battlecard_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        is_positive INTEGER NOT NULL,
        worked INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (battlecard_id) REFERENCES battlecards(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS knowledge_base (
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
      );

      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL,
        activity_type TEXT NOT NULL,
        description TEXT NOT NULL,
        metadata TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS deal_notes (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        link TEXT,
        is_read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details TEXT,
        ip_address TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        deal_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        type TEXT CHECK(type IN ('re_engagement', 'follow_up', 'reminder', 'other')) NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        due_date TEXT NOT NULL,
        is_completed INTEGER DEFAULT 0,
        completed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS research_profiles (
        id TEXT PRIMARY KEY,
        lead_id TEXT,
        deal_id TEXT,
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
        FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
        FOREIGN KEY (requested_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS social_profiles (
        id TEXT PRIMARY KEY,
        lead_id TEXT,
        deal_id TEXT,
        research_profile_id TEXT NOT NULL,
        platform TEXT CHECK(platform IN ('linkedin', 'twitter', 'github', 'reddit', 'facebook', 'website')) NOT NULL,
        profile_url TEXT,
        username TEXT,
        display_name TEXT,
        bio TEXT,
        followers_count INTEGER,
        profile_data TEXT,
        fetched_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
        FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
        FOREIGN KEY (research_profile_id) REFERENCES research_profiles(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS generated_messages (
        id TEXT PRIMARY KEY,
        lead_id TEXT,
        deal_id TEXT,
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
        FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
        FOREIGN KEY (research_profile_id) REFERENCES research_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (generated_by) REFERENCES users(id)
      );
    `);

    console.log('Tables created successfully');

    // ── Create indexes ──────────────────────────────────────────────

    await execMulti(`
      CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner_id);
      CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
      CREATE INDEX IF NOT EXISTS idx_deals_name ON deals(name);
      CREATE INDEX IF NOT EXISTS idx_deals_email ON deals(email);
      CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(owner_id);
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
      CREATE INDEX IF NOT EXISTS idx_leads_name ON leads(name);
      CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
      CREATE INDEX IF NOT EXISTS idx_transcripts_deal ON transcripts(deal_id);
      CREATE INDEX IF NOT EXISTS idx_sales_rooms_slug ON sales_rooms(public_url_slug);
      CREATE INDEX IF NOT EXISTS idx_activities_deal ON activities(deal_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
      CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_deal ON tasks(deal_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
      CREATE INDEX IF NOT EXISTS idx_research_profiles_lead ON research_profiles(lead_id);
      CREATE INDEX IF NOT EXISTS idx_research_profiles_deal ON research_profiles(deal_id);
      CREATE INDEX IF NOT EXISTS idx_social_profiles_lead ON social_profiles(lead_id);
      CREATE INDEX IF NOT EXISTS idx_social_profiles_deal ON social_profiles(deal_id);
      CREATE INDEX IF NOT EXISTS idx_social_profiles_platform ON social_profiles(platform);
      CREATE INDEX IF NOT EXISTS idx_generated_messages_lead ON generated_messages(lead_id);
      CREATE INDEX IF NOT EXISTS idx_generated_messages_deal ON generated_messages(deal_id);
      CREATE INDEX IF NOT EXISTS idx_generated_messages_channel ON generated_messages(channel);
    `);

    console.log('Indexes created successfully');

    // ── Seed admin user ─────────────────────────────────────────────

    const existingAdmin = await getRow('SELECT id FROM users WHERE email = ?', ['admin@salesroom.local']);

    if (!existingAdmin) {
      const adminId = uuidv4();
      const passwordHash = bcrypt.hashSync('Admin123!', 10);

      await runStmt(
        'INSERT INTO users (id, email, password_hash, name, role, is_active) VALUES (?, ?, ?, ?, ?, ?)',
        [adminId, 'admin@salesroom.local', passwordHash, 'System Admin', 'admin', 1]
      );

      console.log('Created default admin user:');
      console.log('  Email: admin@salesroom.local');
      console.log('  Password: Admin123!');
    } else {
      console.log('Admin user already exists');
    }

    // ── Seed default system settings ────────────────────────────────

    const defaultSettings = [
      ['session_timeout_hours', '4'],
      ['max_file_size_mb', '10'],
      ['stagnation_warning_days', '10'],
      ['stagnation_critical_days', '20'],
      ['auto_archive_months', '12'],
    ];

    for (const [key, value] of defaultSettings) {
      await runStmt(
        'INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)',
        [key, value]
      );
    }

    console.log('Database initialized successfully!');
    console.log(`Mode: ${isPostgres ? 'PostgreSQL (Neon)' : 'SQLite'}`);
    if (!isPostgres) {
      console.log(`Database location: ${DATABASE_URL}`);
    }

    await closeConnection();
  } catch (error) {
    console.error('Database initialization error:', error);
    process.exit(1);
  }
}

initDatabase();
