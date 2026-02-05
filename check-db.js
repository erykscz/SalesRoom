import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'data/salesroom.db');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting:', err);
    return;
  }
  console.log('Connected to database');

  db.all('SELECT id, public_url_slug, deal_id FROM sales_rooms', [], (err, rows) => {
    if (err) {
      console.error('Query error:', err);
    } else {
      console.log('Sales rooms:', rows);
    }
    db.close();
  });
});
