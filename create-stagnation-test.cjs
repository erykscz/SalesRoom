const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const db = new Database('./data/salesroom.db');

// Get admin user ID
const admin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@salesroom.local');
const adminId = admin.id;

// Create deal from 15 days ago (warning - yellow)
const deal15d = {
  id: uuidv4(),
  company_name: 'STAGNATION_15_DAYS_WARNING',
  industry: 'Technology',
  stage: 'qualified',
  next_step_date: '2026-03-01',
  health_score: 50,
  owner_id: adminId,
  source: 'manual',
  priority: 'medium'
};

// Create deal from 25 days ago (critical - red)
const deal25d = {
  id: uuidv4(),
  company_name: 'STAGNATION_25_DAYS_CRITICAL',
  industry: 'Technology',
  stage: 'discovery',
  next_step_date: '2026-03-01',
  health_score: 50,
  owner_id: adminId,
  source: 'manual',
  priority: 'medium'
};

// Insert with backdated created_at
const insertStmt = db.prepare(`
  INSERT INTO deals (id, company_name, industry, stage, next_step_date, health_score, owner_id, source, priority, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?))
`);

// 15 days ago
insertStmt.run(
  deal15d.id, deal15d.company_name, deal15d.industry, deal15d.stage,
  deal15d.next_step_date, deal15d.health_score, deal15d.owner_id,
  deal15d.source, deal15d.priority, '-15 days', '-15 days'
);
console.log('Created 15-day stagnation test deal:', deal15d.company_name);

// 25 days ago
insertStmt.run(
  deal25d.id, deal25d.company_name, deal25d.industry, deal25d.stage,
  deal25d.next_step_date, deal25d.health_score, deal25d.owner_id,
  deal25d.source, deal25d.priority, '-25 days', '-25 days'
);
console.log('Created 25-day stagnation test deal:', deal25d.company_name);

// Also create activities for these deals (deal_created type, not stage_changed)
const activityStmt = db.prepare(`
  INSERT INTO activities (id, deal_id, activity_type, description, created_by, created_at)
  VALUES (?, ?, 'deal_created', ?, ?, datetime('now', ?))
`);

activityStmt.run(uuidv4(), deal15d.id, 'Deal created for STAGNATION_15_DAYS_WARNING', adminId, '-15 days');
activityStmt.run(uuidv4(), deal25d.id, 'Deal created for STAGNATION_25_DAYS_CRITICAL', adminId, '-25 days');

console.log('Done! Stagnation test deals created.');
db.close();
