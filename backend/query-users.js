import sqlite3 from 'sqlite3';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'data', 'salesroom.db');
console.log('Using DB path:', dbPath);
const db = new sqlite3.Database(dbPath);

db.all('SELECT id, email, name, role FROM users', (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log(JSON.stringify(rows, null, 2));
  }
  db.close();
});
