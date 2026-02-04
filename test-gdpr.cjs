// Test GDPR delete API
const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function test() {
  // First login to get token
  console.log('Logging in...');
  const loginData = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { email: 'admin@salesroom.local', password: 'Admin123!' });

  console.log('Login response:', loginData);

  if (!loginData.token) {
    console.log('Login failed');
    return;
  }

  // Get users list
  console.log('\nGetting users...');
  const users = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/users',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${loginData.token}` }
  });
  console.log('Users:', users.map(u => ({ id: u.id, email: u.email })));

  // Find test user
  const testUser = users.find(u => u.email === 'testuser@salesroom.local');
  if (!testUser) {
    console.log('Test user not found');
    return;
  }

  // Get GDPR preview
  console.log('\nGetting GDPR preview...');
  const preview = await request({
    hostname: 'localhost',
    port: 3001,
    path: `/api/admin/gdpr-preview/${testUser.id}`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${loginData.token}` }
  });
  console.log('GDPR Preview:', preview);

  // Try GDPR delete with correct password
  console.log('\nPerforming GDPR delete...');
  const deleteResult = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/admin/gdpr-delete',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${loginData.token}`
    }
  }, { userId: testUser.id, password: 'Admin123!' });
  console.log('GDPR Delete result:', deleteResult);
}

test().catch(console.error);
