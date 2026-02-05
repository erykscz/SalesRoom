const Database = require('./backend/node_modules/better-sqlite3');
const db = new Database('./features.db');
const results = db.prepare("SELECT id, name, category FROM features WHERE passes = 0 ORDER BY priority LIMIT 40").all();
results.forEach(r => console.log(r.id + ': ' + r.name));
