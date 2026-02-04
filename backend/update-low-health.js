import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../data/salesroom.db');
const db = new sqlite3.Database(dbPath);

// Update one deal to have low health score
db.run('UPDATE deals SET health_score = 30 WHERE id = ?', ['91a3be98-e3e5-4fbf-b818-c5baa27fab8a'], function(err) {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log(`Updated deal to health_score 30 (rows affected: ${this.changes})`);
  }
  db.close();
});
