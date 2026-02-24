import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
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
const db = new sqlite3.Database(dbPath);

console.log('Initializing database...');

// Helper to run SQL
function runSQL(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function runStatement(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getOne(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function initDatabase() {
  try {
    // Enable foreign keys
    await runSQL('PRAGMA foreign_keys = ON');

    // Create all tables
    await runSQL(`
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT CHECK(role IN ('rep', 'sdr', 'ae', 'manager', 'admin')) DEFAULT 'rep',
        avatar_url TEXT,
        notification_preferences TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Sessions table for JWT refresh tokens
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Password reset tokens table
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Deals table (person-centric: deal is about a person at a company)
      CREATE TABLE IF NOT EXISTS deals (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        job_title TEXT,
        email TEXT,
        phone TEXT,
        linkedin_url TEXT,
        company_name TEXT,
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

      -- Leads table (person-centric: lead is about a person at a company)
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
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

      -- Intent Searches table
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

      -- ICP Templates table
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

      -- Transcripts table
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

      -- Sales Rooms table
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
        created_by TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );

      -- Sales Room Analytics table
      CREATE TABLE IF NOT EXISTS sales_room_analytics (
        id TEXT PRIMARY KEY,
        sales_room_id TEXT NOT NULL,
        visitor_role TEXT,
        section_viewed TEXT,
        time_spent_seconds INTEGER DEFAULT 0,
        visited_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (sales_room_id) REFERENCES sales_rooms(id) ON DELETE CASCADE
      );

      -- Chatbot Logs table
      CREATE TABLE IF NOT EXISTS chatbot_logs (
        id TEXT PRIMARY KEY,
        sales_room_id TEXT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        asked_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (sales_room_id) REFERENCES sales_rooms(id) ON DELETE CASCADE
      );

      -- Poll Responses table
      CREATE TABLE IF NOT EXISTS poll_responses (
        id TEXT PRIMARY KEY,
        sales_room_id TEXT NOT NULL,
        visitor_role TEXT,
        response TEXT NOT NULL,
        feedback TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (sales_room_id) REFERENCES sales_rooms(id) ON DELETE CASCADE
      );

      -- Battlecards table
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

      -- Battlecard Feedback table
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

      -- Knowledge Base table
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id TEXT PRIMARY KEY,
        type TEXT CHECK(type IN ('case_study', 'faq', 'competitor_sheet', 'offer_template')) NOT NULL,
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

      -- Activities table
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

      -- Deal Notes table
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

      -- Notifications table
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

      -- Audit Log table
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

      -- System Settings table
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Tasks table (for re-engagement, follow-ups, etc.)
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
    `);

    // Create indexes
    await runSQL(`
      CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner_id);
      CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
      CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(owner_id);
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
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
      CREATE INDEX IF NOT EXISTS idx_deals_person_name ON deals(first_name, last_name);
      CREATE INDEX IF NOT EXISTS idx_deals_email ON deals(email);
      CREATE INDEX IF NOT EXISTS idx_leads_person_name ON leads(first_name, last_name);
      CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
    `);

    // Check if admin user exists
    const existingAdmin = await getOne('SELECT id FROM users WHERE email = ?', ['admin@salesroom.local']);

    if (!existingAdmin) {
      const adminId = uuidv4();
      const passwordHash = bcrypt.hashSync('Admin123!', 10);

      await runStatement(
        'INSERT INTO users (id, email, password_hash, name, role, is_active) VALUES (?, ?, ?, ?, ?, ?)',
        [adminId, 'admin@salesroom.local', passwordHash, 'System Admin', 'admin', 1]
      );

      console.log('Created default admin user:');
      console.log('  Email: admin@salesroom.local');
      console.log('  Password: Admin123!');
    } else {
      console.log('Admin user already exists');
    }

    // Insert default system settings
    const defaultSettings = [
      ['session_timeout_hours', '4'],
      ['max_file_size_mb', '10'],
      ['stagnation_warning_days', '10'],
      ['stagnation_critical_days', '20'],
      ['auto_archive_months', '12'],
    ];

    for (const [key, value] of defaultSettings) {
      await runStatement(
        'INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)',
        [key, value]
      );
    }

    console.log('Database initialized successfully!');
    console.log(`Database location: ${dbPath}`);

    db.close();
  } catch (error) {
    console.error('Database initialization error:', error);
    process.exit(1);
  }
}

initDatabase();
