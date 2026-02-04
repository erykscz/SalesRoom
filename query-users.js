import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./data/salesroom.db');

db.all('SELECT id, email, name, role FROM users', (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log(JSON.stringify(rows, null, 2));
  }
  db.close();
});
