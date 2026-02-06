const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, '../data/salesroom.db'));

db.serialize(() => {
  // Get admin user ID
  db.get('SELECT id FROM users WHERE email = ?', ['admin@salesroom.local'], (err, admin) => {
    if (err) {
      console.error('Error finding admin:', err);
      return;
    }

    const adminId = admin.id;

    // Create deal from 15 days ago (warning - yellow)
    const deal15dId = uuidv4();
    const deal25dId = uuidv4();

    // Insert 15-day old deal
    db.run(`
      INSERT INTO deals (id, company_name, industry, stage, next_step_date, health_score, owner_id, source, priority, created_at, updated_at)
      VALUES (?, 'STAGNATION_15_DAYS_WARNING', 'Technology', 'qualified', '2026-03-01', 50, ?, 'manual', 'medium', datetime('now', '-15 days'), datetime('now', '-15 days'))
    `, [deal15dId, adminId], function(err) {
      if (err) console.error('Error creating 15-day deal:', err);
      else console.log('Created 15-day stagnation test deal: STAGNATION_15_DAYS_WARNING');
    });

    // Insert 25-day old deal
    db.run(`
      INSERT INTO deals (id, company_name, industry, stage, next_step_date, health_score, owner_id, source, priority, created_at, updated_at)
      VALUES (?, 'STAGNATION_25_DAYS_CRITICAL', 'Technology', 'discovery', '2026-03-01', 50, ?, 'manual', 'medium', datetime('now', '-25 days'), datetime('now', '-25 days'))
    `, [deal25dId, adminId], function(err) {
      if (err) console.error('Error creating 25-day deal:', err);
      else console.log('Created 25-day stagnation test deal: STAGNATION_25_DAYS_CRITICAL');
    });

    // Create activities for these deals
    db.run(`
      INSERT INTO activities (id, deal_id, activity_type, description, created_by, created_at)
      VALUES (?, ?, 'deal_created', 'Deal created for STAGNATION_15_DAYS_WARNING', ?, datetime('now', '-15 days'))
    `, [uuidv4(), deal15dId, adminId]);

    db.run(`
      INSERT INTO activities (id, deal_id, activity_type, description, created_by, created_at)
      VALUES (?, ?, 'deal_created', 'Deal created for STAGNATION_25_DAYS_CRITICAL', ?, datetime('now', '-25 days'))
    `, [uuidv4(), deal25dId, adminId], function(err) {
      if (err) console.error('Error:', err);
      else console.log('Done! Stagnation test deals created.');
      db.close();
    });
  });
});
