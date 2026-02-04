import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../data/salesroom.db');
const db = new sqlite3.Database(dbPath);

// Update health scores for testing
const updates = [
  { id: 'cec7b7c0-cf26-45c5-b452-638ce64e1b9f', health_score: 80 },
  { id: '96f99d4c-6153-4ce9-a92f-53e8d6e2d21e', health_score: 40 }
];

updates.forEach(({ id, health_score }) => {
  db.run('UPDATE deals SET health_score = ? WHERE id = ?', [health_score, id], function(err) {
    if (err) {
      console.error(`Error updating ${id}:`, err);
    } else {
      console.log(`Updated deal ${id} to health_score ${health_score} (rows affected: ${this.changes})`);
    }
  });
});

// Verify the updates
setTimeout(() => {
  db.all('SELECT id, company_name, health_score FROM deals ORDER BY health_score DESC', (err, rows) => {
    if (err) {
      console.error('Error reading:', err);
    } else {
      console.log('\nDeals with health scores:');
      rows.forEach(row => {
        console.log(`  ${row.company_name}: ${row.health_score}%`);
      });
    }
    db.close();
  });
}, 500);
