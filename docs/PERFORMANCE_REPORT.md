# Performance Report -- Phase 4

**Date:** 2026-03-04
**Scope:** Backend N+1 queries, missing indexes, frontend re-renders, memory leaks, bundle size, load testing

---

## 1. N+1 Queries

### Finding 1 -- Kanban endpoint: query per deal for stagnation data

**File:** `backend/src/routes/deals.js`
**Lines:** 234--263

```js
const dealsWithStagnation = await Promise.all(deals.map(async (deal) => {
  const lastStageChange = await get(
    `SELECT created_at FROM activities
     WHERE deal_id = ? AND activity_type = 'stage_changed'
     ORDER BY created_at DESC LIMIT 1`,
    [deal.id]
  );
  // ...
}));
```

**Impact:** One extra `SELECT` per deal. With 200 deals this fires 201 queries.
**Fix:** Replace with a single aggregated query:

```sql
SELECT deal_id, MAX(created_at) AS last_stage_change
FROM activities
WHERE activity_type = 'stage_changed'
GROUP BY deal_id
```

Then join in memory or via a LEFT JOIN in the main deals query.

---

### Finding 2 -- CSV import: INSERT per row inside a loop

**File:** `backend/src/routes/deals.js`
**Lines:** 1006--1126 (CSV import) and 1252--1392 (Lix import)

```js
for (let i = 1; i < lines.length; i++) {
  // ...
  await run(`INSERT INTO deals (...) VALUES (...)`, [...]);
  await run(`INSERT INTO activities (...) VALUES (...)`, [...]);
}
```

**Impact:** 2--4 queries per CSV row. A 500-row import = 1000--2000 sequential queries.
**Fix:** Use a single transaction wrapping all inserts, or batch INSERT statements. For SQLite, wrapping in `BEGIN`/`COMMIT` provides 10-50x speedup.

---

### Finding 3 -- CSV import: deal list assignment loop

**File:** `backend/src/routes/deals.js`
**Lines:** 1146--1156

```js
for (const deal of createdDeals) {
  await run(
    `INSERT INTO deal_list_items (id, deal_list_id, deal_id) VALUES (?, ?, ?)`,
    [uuidv4(), assignedListId, deal.id]
  );
}
```

**Impact:** One INSERT per deal for list assignment.
**Fix:** Batch the INSERTs or wrap in a single transaction.

---

### Finding 4 -- Deal-lists: add deals loop

**File:** `backend/src/routes/deal-lists.js`
**Lines:** 128--141

```js
for (const dealId of dealIds) {
  await run(
    `INSERT INTO deal_list_items (id, deal_list_id, deal_id) VALUES (?, ?, ?)`,
    [uuidv4(), id, dealId]
  );
}
```

**Impact:** One INSERT per dealId in the request body.
**Fix:** Batch the INSERTs into a single statement or transaction.

---

### Finding 5 -- Archive job: UPDATE + INSERT per inactive deal

**File:** `backend/src/routes/deals.js`
**Lines:** 2062--2085

```js
for (const deal of inactiveDeals) {
  await run('UPDATE deals SET is_archived = 1 ...');
  await run('INSERT INTO activities ...');
}
```

**Impact:** 2 queries per deal being archived.
**Fix:** Batch the UPDATE into a single `WHERE id IN (...)` query and batch-insert activities.

---

### Finding 6 -- Bulk enrichment: sequential job creation

**File:** `backend/src/routes/enrichment.js`
**Lines:** 116--128

```js
for (const job of jobs) {
  await run(`INSERT INTO enrichment_jobs ...`);
  await startEnrichment(jobId, ...);
}
```

**Impact:** Sequential INSERT + async enrichment start per entity (up to 50).
**Fix:** Batch the INSERT statements; parallelise the enrichment starts with `Promise.all`.

---

### Finding 7 -- Lix import: 4--5 INSERTs per row

**File:** `backend/src/routes/deals.js`
**Lines:** 1252--1392

Each row in the Lix import loop performs:
1. INSERT INTO deals
2. INSERT INTO research_profiles
3. INSERT INTO social_profiles
4. INSERT INTO activities

**Impact:** 4 queries per row. A 100-row import = 400 sequential queries.
**Fix:** Wrap the entire import in a single transaction.

---

## 2. Missing Indexes

The schema in `backend/src/db/init.js` already defines a solid set of indexes (lines 573--608). After reviewing all tables, foreign keys, and query patterns, the following indexes are missing:

```sql
-- battlecards: filtered by category and created_by
CREATE INDEX IF NOT EXISTS idx_battlecards_category ON battlecards(category);
CREATE INDEX IF NOT EXISTS idx_battlecards_created_by ON battlecards(created_by);

-- battlecard_feedback: filtered by battlecard_id and user_id
CREATE INDEX IF NOT EXISTS idx_battlecard_feedback_battlecard ON battlecard_feedback(battlecard_id);
CREATE INDEX IF NOT EXISTS idx_battlecard_feedback_user ON battlecard_feedback(user_id);

-- knowledge_base: filtered by type, is_shared, and created_by
CREATE INDEX IF NOT EXISTS idx_knowledge_base_type ON knowledge_base(type);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_created_by ON knowledge_base(created_by);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_shared ON knowledge_base(is_shared);

-- sales_room_analytics: filtered by sales_room_id (no index exists)
CREATE INDEX IF NOT EXISTS idx_sales_room_analytics_room ON sales_room_analytics(sales_room_id);

-- chatbot_logs: filtered by sales_room_id
CREATE INDEX IF NOT EXISTS idx_chatbot_logs_room ON chatbot_logs(sales_room_id);

-- poll_responses: filtered by sales_room_id
CREATE INDEX IF NOT EXISTS idx_poll_responses_room ON poll_responses(sales_room_id);

-- deal_notes: filtered by deal_id
CREATE INDEX IF NOT EXISTS idx_deal_notes_deal ON deal_notes(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_notes_created_by ON deal_notes(created_by);

-- password_reset_tokens: filtered by user_id and token
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);

-- icp_templates: filtered by owner_id and is_shared
CREATE INDEX IF NOT EXISTS idx_icp_templates_owner ON icp_templates(owner_id);

-- intent_searches: filtered by owner_id and status
CREATE INDEX IF NOT EXISTS idx_intent_searches_owner ON intent_searches(owner_id);
CREATE INDEX IF NOT EXISTS idx_intent_searches_status ON intent_searches(status);

-- leads: search_id and deal_id foreign keys
CREATE INDEX IF NOT EXISTS idx_leads_search ON leads(search_id);
CREATE INDEX IF NOT EXISTS idx_leads_deal ON leads(deal_id);

-- transcripts: uploaded_by foreign key
CREATE INDEX IF NOT EXISTS idx_transcripts_uploaded_by ON transcripts(uploaded_by);

-- sales_rooms: created_by foreign key and deal_id already has UNIQUE
CREATE INDEX IF NOT EXISTS idx_sales_rooms_created_by ON sales_rooms(created_by);

-- notifications: composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);

-- deals: is_archived is frequently filtered
CREATE INDEX IF NOT EXISTS idx_deals_archived ON deals(is_archived);

-- tasks: is_completed is frequently filtered
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(is_completed);

-- social_profiles: research_profile_id foreign key
CREATE INDEX IF NOT EXISTS idx_social_profiles_research ON social_profiles(research_profile_id);

-- generated_messages: research_profile_id and generated_by foreign keys
CREATE INDEX IF NOT EXISTS idx_generated_messages_research ON generated_messages(research_profile_id);
CREATE INDEX IF NOT EXISTS idx_generated_messages_generated_by ON generated_messages(generated_by);

-- research_profiles: requested_by and status
CREATE INDEX IF NOT EXISTS idx_research_profiles_requested_by ON research_profiles(requested_by);
CREATE INDEX IF NOT EXISTS idx_research_profiles_status ON research_profiles(status);
```

**Total: 27 missing indexes across 15 tables.**

---

## 3. Frontend Re-renders

### Finding 1 -- DealDetailPage: large monolithic component (~800+ lines)

**File:** `frontend/src/pages/deals/DealDetailPage.tsx`

- 15+ state variables in a single component
- No `React.memo` on the export
- Inline handler functions (e.g., `handleDelete`, `handleTransfer`, `fetchUsers`) recreated every render
- `formatCurrency` and `formatDate` utility functions defined inside the component body

**Fix suggestions:**
- Extract sub-sections (activity timeline, deal header, autopsy modal) into memoized child components
- Move formatting functions outside the component
- Use `useCallback` for handlers passed to child components

---

### Finding 2 -- DealsPage: multiple useEffect chains cause cascading re-renders

**File:** `frontend/src/pages/deals/DealsPage.tsx`

- Three `useEffect` hooks with overlapping dependencies:
  - URL sync effect (line 105) depends on 10+ state variables
  - Page reset effect (line 121) depends on 8 state variables
  - Data fetch effect (line 125) depends on 10+ state variables
- Changing a single filter triggers all three effects sequentially

**Fix suggestions:**
- Consolidate the URL sync and page reset logic into a single `useEffect` or custom hook
- Use `useDeferredValue` or debouncing for the search term

---

### Finding 3 -- DashboardPage: formatCurrency/formatDate recreated every render

**File:** `frontend/src/pages/DashboardPage.tsx`
**Lines:** 82--100

Utility functions `formatCurrency` and `formatDate` are defined inside the component.

**Fix suggestion:** Move these outside the component or memoize with `useCallback`.

---

### Finding 4 -- KanbanBoard (used in DealsPage): no memoization for deal cards

**File:** `frontend/src/components/deals/KanbanBoard.tsx` (referenced in DealsPage)

Each deal card is rendered inline without `React.memo`. Dragging or state changes re-render all cards.

**Fix suggestion:** Extract the deal card to a `React.memo`-wrapped component.

---

### Finding 5 -- ManagerDashboardPage and AnalyticsPage: inline object creation in JSX

**Files:** `frontend/src/pages/manager/ManagerDashboardPage.tsx`, `frontend/src/pages/manager/AnalyticsPage.tsx`

Inline `style={{}}` objects and arrow functions passed as props to child components cause unnecessary re-renders.

**Fix suggestion:** Extract styles and callbacks to `useMemo`/`useCallback`.

---

## 4. Memory Leaks

### Finding 1 -- EnrichmentPanel: polling interval without unmount cleanup

**File:** `frontend/src/pages/intent-scraper/components/EnrichmentPanel.tsx`
**Line:** 65

```tsx
pollingRef.current = setInterval(async () => { ... }, 2000);
```

The component has no `useEffect` cleanup to clear `pollingRef` on unmount. If the component unmounts while enrichment is running, the interval continues firing, causing state updates on an unmounted component.

**Fix:** Add a `useEffect` with a cleanup function:
```tsx
useEffect(() => {
  return () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
  };
}, []);
```

---

### Finding 2 -- No AbortController for fetch requests across the entire frontend

**Files:** All 15+ components with `useEffect` + `fetch` patterns.

No file in `frontend/src/` uses `AbortController`. If a component unmounts before a fetch completes, the response callback attempts to set state on an unmounted component. Key files:

- `DealDetailPage.tsx` (line 174)
- `DealsPage.tsx` (line 149)
- `DashboardPage.tsx` (line 58)
- `IntentScraperPage.tsx` (line 172)
- `SalesRoomDetailPage.tsx`
- `SalesRoomPublicPage.tsx`
- `ManagerDashboardPage.tsx`
- `BattlecardsPage.tsx`
- `KnowledgeBasePage.tsx`

**Fix:** Add `AbortController` to all fetch-based `useEffect` hooks:
```tsx
useEffect(() => {
  const controller = new AbortController();
  fetch(url, { signal: controller.signal })
    .then(res => res.json())
    .then(data => setState(data))
    .catch(err => {
      if (err.name !== 'AbortError') setError(err.message);
    });
  return () => controller.abort();
}, [deps]);
```

---

### Finding 3 -- DiscoveryPage: progress simulation interval not tracked for cleanup

**File:** `frontend/src/pages/discovery/DiscoveryPage.tsx`
**Lines:** 126--138

```tsx
const simulateProgress = useCallback(() => {
  let progress = 0;
  const interval = setInterval(() => { ... }, 200);
  return interval;
}, []);
```

The interval is returned but the calling code must properly clear it. If the upload completes before 90% and the component unmounts, the interval may leak.

**Fix:** Ensure the returned interval ID is stored in a ref and cleared on unmount.

---

## 5. Bundle Size

### Build output (Vite production build)

```
dist/index.html                   0.77 kB  | gzip:   0.43 kB
dist/assets/index-Du2ViNua.css   58.95 kB  | gzip:  10.31 kB
dist/assets/index-TKnt7HaR.js  747.01 kB  | gzip: 196.28 kB
```

### Analysis

| Chunk | Raw Size | Gzipped | Status |
|-------|----------|---------|--------|
| `index-TKnt7HaR.js` | **747.01 KB** | 196.28 KB | OVER LIMIT (> 200 KB raw) |
| `index-Du2ViNua.css` | 58.95 KB | 10.31 KB | OK |

**Issue:** The entire application is bundled into a single JS chunk (747 KB). Vite itself warns about this.

**Root causes:**
- No code splitting -- all routes are eagerly loaded
- All page components are statically imported
- Large dependencies (lucide-react icons, xlsx library, etc.) are included in the main bundle

**Fix suggestions:**
1. **Lazy-load routes** using `React.lazy()` + `Suspense`:
   ```tsx
   const DealsPage = React.lazy(() => import('./pages/deals/DealsPage'));
   const DealDetailPage = React.lazy(() => import('./pages/deals/DealDetailPage'));
   // etc.
   ```
2. **Configure manual chunks** in `vite.config.ts`:
   ```ts
   build: {
     rollupOptions: {
       output: {
         manualChunks: {
           vendor: ['react', 'react-dom', 'react-router-dom'],
           ui: ['lucide-react', '@radix-ui/react-dialog', ...],
         }
       }
     }
   }
   ```
3. **Dynamic import xlsx** only in the import route handler, not at the top of DealsPage.

---

## 6. Load Test

### Script location

```
backend/tests/load-test.js
```

### How to run

1. Install k6: https://k6.io/docs/getting-started/installation/
2. Start the backend server:
   ```bash
   cd backend && npm start
   ```
3. Run the load test:
   ```bash
   k6 run backend/tests/load-test.js
   ```
4. Or with custom parameters:
   ```bash
   k6 run --vus 20 --duration 60s backend/tests/load-test.js
   ```

### Endpoints tested

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Authentication |
| `/api/deals` | GET | Deal listing with pagination |
| `/api/leads` | GET | Lead listing |
| `/api/deals` (filtered) | GET | Deals with stage filter + sort |
| `/api/dashboard/stats` | GET | Dashboard aggregate stats |

### Thresholds configured

| Metric | Threshold |
|--------|-----------|
| `http_req_duration` p95 | < 200ms |
| `http_req_duration` p99 | < 500ms |
| Error rate | < 1% |
| Login p95 | < 300ms |
| Deals list p95 | < 200ms |
| Leads list p95 | < 200ms |

---

## Summary

| Category | Findings | Severity |
|----------|----------|----------|
| N+1 Queries | 7 patterns found | Medium-High |
| Missing Indexes | 27 indexes across 15 tables | Medium |
| Frontend Re-renders | 5 patterns found | Low-Medium |
| Memory Leaks | 3 findings (1 interval, 15 fetch, 1 progress) | Medium |
| Bundle Size | 1 chunk at 747 KB (limit: 200 KB) | High |
| Load Test | Script created, ready to run | N/A |
