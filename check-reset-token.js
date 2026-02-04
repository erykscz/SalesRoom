import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./data/salesroom.db');

db.get('SELECT id, user_id, expires_at FROM password_reset_tokens ORDER BY created_at DESC LIMIT 1', [], (err, row) => {
  if (err) {
    console.error('Error:', err);
  } else if (row) {
    console.log('Password reset token found:');
    console.log('  ID:', row.id);
    console.log('  User ID:', row.user_id);
    console.log('  Expires:', row.expires_at);
  } else {
    console.log('No reset tokens found');
  }
  db.close();
});
