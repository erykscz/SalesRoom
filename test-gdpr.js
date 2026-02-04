// Test GDPR delete API
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function test() {
  // First login to get token
  const loginRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@salesroom.local', password: 'Admin123!' })
  });

  const loginData = await loginRes.json();
  console.log('Login response:', loginData);

  if (!loginData.token) {
    console.log('Login failed');
    return;
  }

  // Get users list
  const usersRes = await fetch('http://localhost:3001/api/users', {
    headers: { 'Authorization': `Bearer ${loginData.token}` }
  });
  const users = await usersRes.json();
  console.log('Users:', users);

  // Find test user
  const testUser = users.find(u => u.email === 'testuser@salesroom.local');
  if (!testUser) {
    console.log('Test user not found');
    return;
  }

  // Get GDPR preview
  const previewRes = await fetch(`http://localhost:3001/api/admin/gdpr-preview/${testUser.id}`, {
    headers: { 'Authorization': `Bearer ${loginData.token}` }
  });
  const preview = await previewRes.json();
  console.log('GDPR Preview:', preview);

  // Try GDPR delete with correct password
  const deleteRes = await fetch('http://localhost:3001/api/admin/gdpr-delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${loginData.token}`
    },
    body: JSON.stringify({ userId: testUser.id, password: 'Admin123!' })
  });
  const deleteResult = await deleteRes.json();
  console.log('GDPR Delete result:', deleteResult);
}

test().catch(console.error);
