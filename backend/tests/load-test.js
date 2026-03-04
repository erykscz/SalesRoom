/**
 * k6 Load Test Script for Salesroom API
 *
 * Prerequisites:
 *   1. Install k6: https://k6.io/docs/getting-started/installation/
 *   2. Start the backend server: cd backend && npm start
 *   3. Ensure a test user exists (default: admin@salesroom.local / Admin123!)
 *
 * Run:
 *   k6 run backend/tests/load-test.js
 *
 * Run with custom options:
 *   k6 run --vus 20 --duration 60s backend/tests/load-test.js
 *
 * Run with environment variables:
 *   k6 run -e BASE_URL=http://localhost:3001 -e EMAIL=admin@salesroom.local -e PASSWORD=Admin123! backend/tests/load-test.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Custom metrics ──────────────────────────────────────────────────────

const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration', true);
const dealsDuration = new Trend('deals_list_duration', true);
const leadsDuration = new Trend('leads_list_duration', true);

// ── Configuration ───────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const EMAIL = __ENV.EMAIL || 'admin@salesroom.local';
const PASSWORD = __ENV.PASSWORD || 'Admin123!';

export const options = {
  // Ramp up to 10 VUs over 30s, hold for 1m, ramp down over 10s
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '10s', target: 0 },
  ],

  thresholds: {
    // Global thresholds
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    errors: ['rate<0.01'], // Error rate < 1%

    // Per-endpoint thresholds
    login_duration: ['p(95)<300', 'p(99)<600'],
    deals_list_duration: ['p(95)<200', 'p(99)<500'],
    leads_list_duration: ['p(95)<200', 'p(99)<500'],
  },
};

// ── Setup: authenticate once and share the token ────────────────────────

export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const success = check(loginRes, {
    'setup login status is 200': (r) => r.status === 200,
    'setup login returns token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!body.token;
      } catch {
        return false;
      }
    },
  });

  if (!success) {
    console.error('Setup login failed. Ensure the server is running and credentials are correct.');
    console.error(`Status: ${loginRes.status}, Body: ${loginRes.body}`);
    return { token: null };
  }

  const body = JSON.parse(loginRes.body);
  return { token: body.token };
}

// ── Main test scenario ──────────────────────────────────────────────────

export default function (data) {
  const token = data.token;
  if (!token) {
    errorRate.add(1);
    return;
  }

  const authHeaders = {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  // ── 1. POST /api/auth/login ─────────────────────────────────────────
  group('POST /api/auth/login', () => {
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({ email: EMAIL, password: PASSWORD }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    loginDuration.add(Date.now() - start);

    const passed = check(res, {
      'login status is 200': (r) => r.status === 200,
      'login returns token': (r) => {
        try {
          return !!JSON.parse(r.body).token;
        } catch {
          return false;
        }
      },
    });

    errorRate.add(!passed);
  });

  sleep(0.5);

  // ── 2. GET /api/deals ───────────────────────────────────────────────
  group('GET /api/deals', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/deals?page=1&limit=20`, authHeaders);
    dealsDuration.add(Date.now() - start);

    const passed = check(res, {
      'deals status is 200': (r) => r.status === 200,
      'deals returns array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.deals);
        } catch {
          return false;
        }
      },
      'deals has pagination': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.pagination && typeof body.pagination.total === 'number';
        } catch {
          return false;
        }
      },
    });

    errorRate.add(!passed);
  });

  sleep(0.5);

  // ── 3. GET /api/leads ───────────────────────────────────────────────
  group('GET /api/leads', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/leads`, authHeaders);
    leadsDuration.add(Date.now() - start);

    const passed = check(res, {
      'leads status is 200': (r) => r.status === 200,
      'leads returns array': (r) => {
        try {
          return Array.isArray(JSON.parse(r.body));
        } catch {
          return false;
        }
      },
    });

    errorRate.add(!passed);
  });

  sleep(0.5);

  // ── 4. GET /api/deals (with filters) ───────────────────────────────
  group('GET /api/deals (filtered)', () => {
    const res = http.get(
      `${BASE_URL}/api/deals?stage=new_signal&sort_by=created_at&sort_order=desc&page=1&limit=20`,
      authHeaders
    );

    const passed = check(res, {
      'filtered deals status is 200': (r) => r.status === 200,
    });

    errorRate.add(!passed);
  });

  sleep(0.5);

  // ── 5. GET /api/dashboard/stats ─────────────────────────────────────
  group('GET /api/dashboard/stats', () => {
    const res = http.get(`${BASE_URL}/api/dashboard/stats`, authHeaders);

    const passed = check(res, {
      'dashboard status is 200': (r) => r.status === 200,
      'dashboard has stats': (r) => {
        try {
          return !!JSON.parse(r.body).stats;
        } catch {
          return false;
        }
      },
    });

    errorRate.add(!passed);
  });

  sleep(1);
}

// ── Teardown ────────────────────────────────────────────────────────────

export function teardown(data) {
  if (data.token) {
    console.log('Load test completed. Token was valid throughout the test.');
  } else {
    console.log('Load test completed with errors - no valid token was obtained.');
  }
}
