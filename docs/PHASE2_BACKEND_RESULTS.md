# Phase 2 -- Backend Unit Tests Results

## Summary

**Date:** 2026-03-04
**Test Runner:** Jest 29 with ESM (--experimental-vm-modules)
**HTTP Testing:** Supertest 6
**Total Test Suites:** 7
**Total Tests:** 137
**Passed:** 137 (100%)
**Failed:** 0

## Test Suites Breakdown

### 1. API Endpoint Tests (Category 2 -- Highest Priority)

#### `backend/__tests__/api/auth.test.js` -- 28 tests
Auth routes (POST /api/auth/login, GET /api/auth/me, POST /api/auth/forgot-password, POST /api/auth/reset-password, PUT /api/auth/preferences, GET/PUT /api/auth/master-prompt):
- Login: missing email (400), missing password (400), non-existent user (401), deactivated user (401), wrong password (401), successful login (200), email normalization
- Me: no token (401), invalid token (401), expired token (401), valid token (200)
- Forgot Password: missing email (400), non-existent user returns 200 (prevent enumeration), existing user creates token (200)
- Reset Password: missing token (400), missing password (400), weak password (400), invalid token (400), valid reset (200)
- Preferences: no auth (401), invalid preferences (400), valid update (200)
- Master Prompt: no auth (401), default prompt (200), non-string prompt (400), valid update (200)

#### `backend/__tests__/api/deals.test.js` -- 31 tests
Deals routes (POST, GET, GET/:id, PUT/:id, DELETE/:id, POST/:id/transfer, POST/:id/notes):
- Create: no auth (401), missing name (400), missing next_step_date (400), short company_name (400), invalid stage (400), invalid priority (400), success (201)
- List: no auth (401), success with pagination (200), stage filter (200)
- Get by ID: no auth (401), not found (404), forbidden for non-owner rep (403), success (200)
- Update: no auth (401), not found (404), no fields (400), empty name (400), invalid stage (400), invalid health_score (400), success (200), forbidden (403)
- Delete: no auth (401), not found (404), forbidden (403), success (200)
- Transfer: missing newOwnerId (400), not found (404)
- Notes: missing content (400), deal not found (404), success (201)

#### `backend/__tests__/api/leads.test.js` -- 27 tests
Leads routes (POST, GET, GET/:id, PUT/:id, DELETE/:id, POST/:id/convert-to-deal):
- Create: no auth (401), missing name (400), success (201), minimal data (201)
- List: no auth (401), success (200), empty list (200), search filter (200), status filter (200)
- Get by ID: no auth (401), not found (404), non-owner access denied (404), success (200)
- Update: no auth (401), not found (404), empty name (400), forbidden (403), success (200)
- Delete: no auth (401), not found (404), forbidden (403), success (200)
- Convert to Deal: no auth (401), not found (404), already converted (400), success (201), forbidden (403)

### 2. Middleware Tests

#### `backend/__tests__/middleware/auth.test.js` -- 16 tests
Auth middleware and role-based authorization:
- authMiddleware: no header (401), non-Bearer (401), invalid token (401), expired token (401), user not found (401), deactivated user (401), valid token passes (next called, user attached)
- requireRole: no user (401), wrong role (403), allowed role (200)
- requireManagerOrAbove: no user (401), rep denied (403), manager allowed, admin allowed
- requireAdmin: no user (401), non-admin denied (403), admin allowed

#### `backend/__tests__/middleware/errorHandler.test.js` -- 8 tests
Error handler middleware:
- ValidationError (400), JsonWebTokenError (401), TokenExpiredError (401)
- SQLITE_CONSTRAINT UNIQUE (409), SQLITE_CONSTRAINT FOREIGN KEY (400)
- Custom error status, generic 500, empty message defaults to "Internal server error"

### 3. Business Logic Tests (Category 1)

#### `backend/__tests__/services/healthScore.test.js` -- 12 tests
Health score calculation (calculateHealthScore, calculateHealthScores):
- Base score = 50
- Decision maker +10, confirmed budget +20
- Recent activity (within 7 days) +10
- No activity for 14+ days -30
- Next step date in future +5
- Compelling event within 30 days +5
- Deal value >= 50000 +5
- Score capped at 0 and 100
- Combined factors
- Batch calculation for multiple deals

#### `backend/__tests__/services/dealsLogic.test.js` -- 15 tests
CSV import logic, validation edge cases, and app-level tests:
- CSV Preview: missing content (400), header-only (400), standard format detection, LinkedIn format detection, quoted fields
- CSV Import: missing content (400), successful import of 2 deals
- Validation: all 7 valid stages accepted, all 3 valid priorities accepted, company_name > 255 chars (400), industry > 100 chars (400), next_step_description > 1000 chars (400)
- Health check: GET /api/health returns 200
- 404 handler: unknown endpoints return 404

## Technical Notes

- Backend uses ESM (`"type": "module"`); Jest runs with `--experimental-vm-modules`
- Database module is fully mocked (no real SQLite connections during tests)
- JWT tokens are generated with the same secret used by the app
- `process.env.VERCEL = '1'` prevents `app.listen()` during tests
- `jest.resetAllMocks()` used in `beforeEach` to clear mock implementation queues
- Notifications module mocked with a function-based Router mock (Express Router is a function)
- Test command: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js --forceExit --detectOpenHandles`
