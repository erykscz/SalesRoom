# Code Audit Report

**Date:** 2026-03-04
**Auditor:** Automated Testing Pipeline (Phase 1)
**Project:** salesroom-app-fresh (Monorepo: React frontend + Express backend)

---

## Static Analysis Summary

| Check | Result |
|-------|--------|
| TypeScript (`tsc --noEmit`) | **PASS** -- 0 errors |
| ESLint | **SKIPPED** -- No ESLint configuration found in frontend |
| Frontend npm audit | 10 vulnerabilities (3 moderate, 7 high) |
| Backend npm audit | 8 vulnerabilities (1 low, 7 high) |

---

## CRITICAL (P0) -- Must fix before tests

### P0-01: Hardcoded JWT Secret Fallback

- **File:** `backend/src/middleware/auth.js` (line 4)
- **Also:** `backend/src/routes/auth.js` (line 9)
- **Description:** The JWT secret has a hardcoded fallback value `'your-super-secret-jwt-key-change-in-production'`. If `JWT_SECRET` env var is missing, all tokens are signed with a publicly known key, allowing any attacker to forge auth tokens.
- **Severity:** Critical
- **Suggested fix:** Remove the fallback. Throw an error at startup if `JWT_SECRET` is not set. Add a check like `if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set');`.

### P0-02: No Rate Limiting on Login and Public Endpoints

- **File:** `backend/src/routes/auth.js` (lines 13, 138, 180)
- **Also:** `backend/src/routes/sales-rooms-public.js` (lines 10, 377)
- **Description:** The `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password`, and public Sales Room chatbot endpoints have no rate limiting. This enables brute-force password attacks, password reset abuse, and API cost attacks on the Claude AI chatbot endpoint.
- **Severity:** Critical
- **Suggested fix:** Add `express-rate-limit` middleware. Recommended limits: login (5 attempts/15min per IP), forgot-password (3/hour per IP), chatbot (20 requests/min per session).

### P0-03: SQL Injection via Dynamic Table Name in Enrichment Route

- **File:** `backend/src/routes/enrichment.js` (lines 34-35, 148)
- **Description:** The `entityType` parameter is used to dynamically construct a table name via string interpolation: `` `SELECT id, owner_id FROM ${table} WHERE id = ?` ``. While `entityType` is validated to be 'lead' or 'deal', this pattern is inherently risky and should use a whitelist lookup instead of direct interpolation.
- **Severity:** Critical (pattern risk, currently mitigated by validation)
- **Suggested fix:** Use a mapping object: `const tableMap = { deal: 'deals', lead: 'leads' }; const table = tableMap[entityType];` and guard with `if (!table) return res.status(400)...`.

### P0-04: xlsx Library has Known Prototype Pollution Vulnerability (No Fix Available)

- **File:** `backend/package.json` (xlsx dependency)
- **Description:** The `xlsx` library used for Lix IT Excel import has a high-severity Prototype Pollution vulnerability (GHSA-4r6h-8v6p-xvw6) and ReDoS vulnerability (GHSA-5pgg-2g8v-p4x9). No fix is available from the maintainer.
- **Severity:** Critical
- **Suggested fix:** Replace `xlsx` with `exceljs` or `sheetjs/xlsx-community` which are actively maintained and patched.

---

## HIGH (P1) -- Should fix soon

### P1-01: DELETE /api/deals/batch/all Has No Authorization Check

- **File:** `backend/src/routes/deals.js` (line 727)
- **Description:** The `DELETE /api/deals/batch/all` endpoint deletes ALL deals from the database. While it requires authentication (via router-level middleware), it has no role check -- any authenticated user (including regular reps) can delete every deal in the system.
- **Severity:** High
- **Suggested fix:** Add `requireRole('admin')` middleware or at minimum a role check inside the handler.

### P1-02: No Input Sanitization on CSV/Excel Import

- **File:** `backend/src/routes/deals.js` (lines 905-1170, 1174-1407)
- **Description:** The CSV and Lix IT Excel import endpoints accept user-provided content and insert it directly into the database. While parameterized queries prevent SQL injection, there is no sanitization of the input data for XSS payloads. When deal names/descriptions containing `<script>` tags are later rendered in the frontend, they could execute malicious code.
- **Severity:** High
- **Suggested fix:** Add server-side HTML entity encoding for all string fields before database insertion. Also ensure the frontend uses React's built-in escaping (which it does for JSX) and does not use `dangerouslySetInnerHTML` with user data.

### P1-03: Missing ESLint Configuration

- **File:** `frontend/` (no `.eslintrc` found)
- **Description:** No ESLint configuration exists in the frontend. While TypeScript provides type safety, ESLint catches code quality issues (unused variables, unreachable code, accessibility rules, React best practices).
- **Severity:** High
- **Suggested fix:** Run `npm init @eslint/config` and configure with `@typescript-eslint/eslint-plugin`, `eslint-plugin-react`, and `eslint-plugin-jsx-a11y`.

### P1-04: Frontend Dependency Vulnerabilities (esbuild, rollup, minimatch)

- **File:** `frontend/package.json`
- **Description:**
  - `esbuild <=0.24.2` -- Enables any website to send requests to the dev server (GHSA-67mh-4wv8-2f99)
  - `rollup 4.0.0-4.58.0` -- Arbitrary File Write via Path Traversal (GHSA-mw96-cpmx-2vgc)
  - `minimatch <=3.1.3` -- Multiple ReDoS vulnerabilities
- **Severity:** High
- **Suggested fix:** Run `npm audit fix` to patch `ajv` and `rollup`. For `esbuild`, run `npm audit fix --force` (requires `vite` major version bump to v7).

### P1-05: Backend Dependency Vulnerabilities (tar, qs, minimatch)

- **File:** `backend/package.json`
- **Description:**
  - `tar <=7.5.7` -- Multiple file overwrite/traversal vulnerabilities via sqlite3 -> node-gyp dependency chain
  - `qs 6.7.0-6.14.1` -- arrayLimit bypass allowing denial of service (via Express)
  - `minimatch <=3.1.3` -- Multiple ReDoS vulnerabilities
- **Severity:** High
- **Suggested fix:** Run `npm audit fix` to patch `minimatch` and `qs`. The `tar` vulnerability requires `npm audit fix --force` (sqlite3 major version change).

### P1-06: Public Chatbot Endpoint Proxies to Claude API Without Cost Controls

- **File:** `backend/src/routes/sales-rooms-public.js` (line 377)
- **Description:** The `/api/sales-rooms/public/:slug/chat` endpoint is publicly accessible (no authentication) and directly calls the Anthropic Claude API. An attacker could abuse this to generate significant API costs. There is no per-session limit, no CAPTCHA, and no cost tracking.
- **Severity:** High
- **Suggested fix:** Add rate limiting (e.g., 10 messages/hour per IP), implement a session token or CAPTCHA, and add cost monitoring/alerting.

### P1-07: Test/Debug Endpoints Accessible in Production

- **File:** `backend/src/routes/deals.js` (lines 1974, 2101)
- **Description:** Endpoints `POST /api/deals/tasks/simulate-time` and `POST /api/deals/:id/simulate-inactivity` manipulate database timestamps for testing purposes. They are protected by auth but have no environment check, meaning they are available in production and could corrupt data.
- **Severity:** High
- **Suggested fix:** Gate these endpoints behind `process.env.NODE_ENV !== 'production'` or remove them entirely and use proper test fixtures.

---

## MEDIUM (P2) -- Nice to have

### P2-01: Missing Database Indexes

- **File:** `backend/src/db/init.js`
- **Description:** Several commonly queried columns lack indexes:
  - `deals.is_archived` -- Used in every list/kanban query filter
  - `deals.company_name` -- Used in search queries
  - `activities.activity_type` -- Used for stage change lookups in kanban
  - `activities.created_at` -- Used for sorting and gap calculations
  - `sales_room_analytics.sales_room_id + visited_at` -- Compound index for analytics queries
  - `enrichment_jobs.entity_type + entity_id` -- Already indexed but status queries would benefit from `(entity_type, entity_id, status)`
- **Severity:** Medium
- **Suggested fix:** Add the missing indexes in the init.js migration block.

### P2-02: No UNIQUE Constraint on deal_list_items (deal_list_id, deal_id) at Table Level

- **File:** `backend/src/db/init.js` (line 518-526)
- **Description:** The `deal_list_items` table relies on a separate unique index (`idx_deal_list_items_unique`) instead of a table-level UNIQUE constraint. While functionally equivalent, it is better practice to declare the constraint in the table definition.
- **Severity:** Low (functional, cosmetic)

### P2-03: Missing ON DELETE CASCADE on Several Foreign Keys

- **File:** `backend/src/db/init.js`
- **Description:** Several foreign keys do not specify cascade behavior, which can lead to orphaned records:
  - `icp_templates.owner_id` -- No ON DELETE (should CASCADE or SET NULL)
  - `intent_searches.owner_id` -- No ON DELETE
  - `deals.owner_id` -- No ON DELETE (orphaned deals if user deleted)
  - `leads.owner_id` -- No ON DELETE
  - `leads.search_id` -- No ON DELETE
  - `leads.deal_id` -- No ON DELETE
  - `battlecards.created_by` -- No ON DELETE
  - `knowledge_base.created_by` -- No ON DELETE
  - `enrichment_jobs.requested_by` -- No ON DELETE
- **Severity:** Medium
- **Suggested fix:** Add `ON DELETE SET NULL` for ownership references and `ON DELETE CASCADE` where child records should be removed. Note: The GDPR delete handler in admin.js manually handles cascading, but this is error-prone.

### P2-04: No Input Validation Library Used (express-validator)

- **File:** All backend route files
- **Description:** Input validation is done manually with ad-hoc `if` checks throughout all routes. This is inconsistent and error-prone. Several endpoints only validate required fields but not data types, length, or format (e.g., email format, date format, URL format).
- **Severity:** Medium
- **Suggested fix:** Adopt `express-validator` or `zod` for consistent validation. Create reusable validation schemas for common entities (deal, lead, user).

### P2-05: No Pagination on Several List Endpoints

- **File:** `backend/src/routes/leads.js` (line 8), `backend/src/routes/sales-rooms.js` (line 131), `backend/src/routes/battlecards.js`, `backend/src/routes/knowledge.js`
- **Description:** The leads list, sales rooms list, battlecards, and knowledge base list endpoints return all records without pagination. This can cause performance issues and memory problems with large datasets.
- **Severity:** Medium
- **Suggested fix:** Add `LIMIT` and `OFFSET` parameters similar to the deals endpoint implementation.

### P2-06: Kanban Endpoint Runs N+1 Queries

- **File:** `backend/src/routes/deals.js` (lines 234-263)
- **Description:** The `/api/deals/kanban` endpoint fetches all deals, then runs a separate query for each deal to get the last stage change. With 100 deals, this results in 101 queries.
- **Severity:** Medium
- **Suggested fix:** Use a single query with a LEFT JOIN or subquery to get the last stage change date for all deals at once.

### P2-07: Frontend Components Missing Explicit Error States

- **File:** Multiple pages
- **Description:** Several pages handle errors by setting an error state string but display minimal UI:
  - `frontend/src/pages/manager/AnalyticsPage.tsx` -- No error display fallback
  - `frontend/src/pages/manager/TeamPipelinePage.tsx` -- No error display fallback
  - `frontend/src/pages/sales-rooms/SalesRoomsPage.tsx` -- No error display fallback
- **Severity:** Medium
- **Suggested fix:** Add consistent error boundary components and error state UI patterns.

### P2-08: SalesRoomPublicPage Uses dangerouslySetInnerHTML-like Pattern

- **File:** `frontend/src/pages/public/SalesRoomPublicPage.tsx`
- **Description:** The public Sales Room page renders markdown content from sections that was generated by AI. If the AI is compromised or if sections are manually edited to include malicious HTML, this could lead to XSS. React's default escaping helps, but any use of `dangerouslySetInnerHTML` for markdown rendering should be sanitized with DOMPurify.
- **Severity:** Medium
- **Suggested fix:** Verify that all markdown rendering uses a sanitizer like DOMPurify before injecting HTML content.

### P2-09: CORS Allows All Localhost Origins in Development

- **File:** `backend/src/index.js` (lines 62-63)
- **Description:** In non-production mode, any `http://localhost:*` origin is allowed by CORS. While acceptable in development, this could be a risk if the environment variable is misconfigured on staging/production.
- **Severity:** Medium
- **Suggested fix:** Ensure `NODE_ENV=production` is always set in production deployments. Consider removing the wildcard localhost pattern.

### P2-10: No Request Size Limit on Public Chatbot Endpoint

- **File:** `backend/src/routes/sales-rooms-public.js` (line 377)
- **Description:** While the Express app has a 10MB JSON body limit, the public chatbot endpoint does not validate message length. An attacker could send extremely long messages to increase API costs and processing time.
- **Severity:** Medium
- **Suggested fix:** Add `message.length < 2000` validation before calling the Claude API.

---

## LOW (P3) -- Minor improvements

### P3-01: Inconsistent Error Logging

- **File:** All backend route files
- **Description:** Error handling uses `console.error()` throughout. There is no structured logging (no correlation IDs, no log levels, no JSON format). This makes debugging in production difficult.
- **Suggested fix:** Adopt a structured logging library (e.g., `pino` or `winston`) with request correlation IDs.

### P3-02: No Helmet CSP Configuration

- **File:** `backend/src/index.js` (line 45)
- **Description:** `helmet()` is used with default settings but no Content-Security-Policy is explicitly configured. The default CSP may be too restrictive for the frontend or too permissive for security.
- **Suggested fix:** Configure helmet with an explicit CSP that allows the required resources (Anthropic API, Vercel Blob, etc.).

### P3-03: Admin Routes Have Double Auth Middleware

- **File:** `backend/src/routes/admin.js` (lines 10, 84, 132, etc.)
- **Description:** Admin routes apply `authMiddleware` both at the router level (in index.js line 102) and within each route handler. This is redundant but not harmful.
- **Suggested fix:** Remove the per-route `authMiddleware` from admin.js since it is already applied at the router level. Keep only `requireRole('admin')`.

### P3-04: Using TEXT Type for All IDs Instead of UUID Type

- **File:** `backend/src/db/init.js` (all tables)
- **Description:** All primary keys use `TEXT` type. While SQLite does not have a native UUID type, if migrating to PostgreSQL (which the code already supports), using `UUID` type would be more efficient and provide built-in validation.
- **Suggested fix:** For PostgreSQL deployments, consider migrating to native `UUID` type. For SQLite, this is acceptable.

### P3-05: No Accessibility Attributes on Several Interactive Elements

- **File:** Various frontend pages
- **Description:** Several interactive elements lack proper ARIA attributes:
  - Sort buttons in DealsPage lack `aria-label` or `aria-sort`
  - Filter dropdowns lack `aria-label`
  - Icon-only buttons throughout the app lack `aria-label`
  - Health score indicators lack text alternatives
- **Suggested fix:** Add `aria-label`, `aria-sort`, and `role` attributes to interactive elements. Use `sr-only` spans for icon-only buttons.

### P3-06: Frontend Uses Direct fetch() Instead of API Client

- **File:** All frontend pages
- **Description:** Every page makes direct `fetch()` calls with manual token injection, error handling, and response parsing. This leads to significant code duplication and inconsistent error handling.
- **Suggested fix:** Create a centralized API client (e.g., `api.ts` with `get()`, `post()`, `put()`, `delete()` methods) that handles auth headers, error responses, and response parsing.

### P3-07: No Database Connection Pooling

- **File:** `backend/src/db/database.js`
- **Description:** SQLite uses a single connection. While acceptable for SQLite, the PostgreSQL path (Neon) also does not configure connection pooling options.
- **Suggested fix:** For PostgreSQL, configure connection pool settings. For SQLite, consider WAL mode for better concurrency.

### P3-08: Password Reset Token Uses UUID Instead of Cryptographically Secure Random

- **File:** `backend/src/routes/auth.js` (line 154)
- **Description:** The password reset token is generated using `uuidv4()`. While UUIDs have some randomness, they are not designed for security-sensitive tokens. A cryptographically secure random string would be more appropriate.
- **Suggested fix:** Use `crypto.randomBytes(32).toString('hex')` for password reset tokens.

---

## Summary Statistics

| Severity | Count |
|----------|-------|
| CRITICAL (P0) | 4 |
| HIGH (P1) | 7 |
| MEDIUM (P2) | 10 |
| LOW (P3) | 8 |
| **Total** | **29** |

## Key Positive Findings

- All SQL queries use parameterized statements (no raw string concatenation for user input)
- Authentication middleware is consistently applied at the router level for protected endpoints
- Role-based access control is implemented with ownership checks on most endpoints
- All `useEffect` hooks with intervals/subscriptions have proper cleanup functions
- TypeScript compilation passes with zero errors
- CSRF protection is implicitly handled via Bearer token auth (no cookies)
- Password hashing uses bcrypt with appropriate salt rounds (10)
- Sensitive fields (password_hash) are stripped from public API responses
- Audit logging is implemented for security-sensitive operations
- GDPR delete functionality with cascading data removal is implemented
