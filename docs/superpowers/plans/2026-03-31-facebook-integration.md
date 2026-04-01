# Facebook Page Posting Integration Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow dealers to connect their Facebook Business Page and auto-post card listings, schedule batch posts, and get a Marketplace posting assistant.

**Architecture:** Server-side OAuth via Facebook Login for Business (system-user tokens, 60-day expiry). Mirrors existing eBay integration pattern: lib helper + API routes + DB table + integrations UI. Posts use Graph API `/{page-id}/photos` endpoint with card images and formatted descriptions.

**Tech Stack:** Node.js (Vercel serverless), PostgreSQL (Supabase), Facebook Graph API v21.0

---

### Task 1: Database — Create facebook_connections table

**Files:**
- Create: `api/facebook/migrate.js`

- [ ] **Step 1: Create migration endpoint**

Run SQL to create the facebook_connections table mirroring ebay_connections pattern.

- [ ] **Step 2: Run migration**

Hit the endpoint to create the table.

- [ ] **Step 3: Commit**

---

### Task 2: Core Library — lib/facebook.js

**Files:**
- Create: `lib/facebook.js`

- [ ] **Step 1: Build OAuth helpers**

- `getConsentUrl(state)` — Facebook Login dialog URL with permissions
- `exchangeCodeForTokens(code)` — exchange auth code for access token
- `getPageAccessToken(userToken)` — get long-lived page token
- `getValidToken(pool, userId)` — fetch token from DB, check expiry
- `graphApiCall(accessToken, method, path, body)` — generic Graph API caller
- `postToPage(pageToken, pageId, message, imageUrl)` — post a card listing

- [ ] **Step 2: Commit**

---

### Task 3: API Routes — Connect, Callback, Status, Pages

**Files:**
- Create: `api/facebook/connect.js`
- Create: `api/facebook/callback.js`
- Create: `api/facebook/status.js`
- Create: `api/facebook/pages.js`

- [ ] **Step 1: Build connect endpoint** (GET, requireAuth)
- [ ] **Step 2: Build callback endpoint** (GET, no auth, exchanges code, stores tokens)
- [ ] **Step 3: Build status endpoint** (GET/DELETE, requireAuth)
- [ ] **Step 4: Build pages endpoint** (GET, returns user's FB Pages to pick from)
- [ ] **Step 5: Commit**

---

### Task 4: API Routes — Post and Schedule

**Files:**
- Create: `api/facebook/post.js`
- Create: `api/facebook/schedule.js`

- [ ] **Step 1: Build post endpoint** — POST single card or batch to FB Page
- [ ] **Step 2: Build schedule endpoint** — GET/POST/DELETE posting schedules
- [ ] **Step 3: Commit**

---

### Task 5: Integrations UI — Facebook card on integrations.html

**Files:**
- Modify: `integrations.html`

- [ ] **Step 1: Add Facebook integration card** (HTML)
- [ ] **Step 2: Add JavaScript functions** (connect, status, disconnect, post, schedule)
- [ ] **Step 3: Add URL param handling for callback**
- [ ] **Step 4: Commit**

---

### Task 6: Deploy and Test

- [ ] **Step 1: Push to main**
- [ ] **Step 2: Verify OAuth flow works end-to-end**
