# Quickstart Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app quickstart guide page, a welcome banner on the dashboard, and a welcome email sent at signup.

**Architecture:** Three touchpoints — a new `quickstart.html` page (vanilla HTML/CSS/JS matching existing patterns), modifications to `admin.html` for the banner + help link, and a welcome email call added to the signup API endpoint.

**Tech Stack:** Vanilla HTML/CSS/JS, Node.js serverless functions, SendGrid email

---

### Task 1: Create `quickstart.html`

**Files:**
- Create: `quickstart.html`

- [ ] **Step 1: Create the quickstart page**

Create `quickstart.html` with the same page structure as `admin.html` — embedded CSS, dark theme, header nav with dropdowns, auth check via localStorage.

The body contains numbered step cards and a tips section at the bottom.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Collect Sync — Quickstart Guide</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a1a; color: #fff; min-height: 100vh; }
        .header { background: #1a1a2e; padding: 1.5rem 2rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #2a2a3e; }
        .header h1 { font-size: 1.5rem; }
        .header-right { display: flex; gap: 8px; align-items: center; }
        .btn { padding: 8px 16px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: #fff; cursor: pointer; font-size: 13px; text-decoration: none; }
        .btn:hover { background: rgba(255,255,255,0.2); }
        .btn-primary { background: #4a90d9; border-color: #4a90d9; }
        .nav-dropdown { position: relative; display: inline-block; }
        .nav-dropdown-btn { cursor: pointer; }
        .nav-dropdown-menu { display: none; position: absolute; top: 100%; right: 0; background: #1a1a2e; border: 1px solid #2a2a3e; border-radius: 8px; min-width: 180px; padding: 6px 0; z-index: 50; margin-top: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
        .nav-dropdown-menu.open { display: block; }
        .nav-dropdown-menu a { display: block; padding: 8px 16px; color: #ccc; text-decoration: none; font-size: 13px; }
        .nav-dropdown-menu a:hover { background: rgba(255,255,255,0.05); color: #fff; }
        .nav-dropdown-menu .divider { border-top: 1px solid #2a2a3e; margin: 4px 0; }
        .container { max-width: 900px; margin: 0 auto; padding: 2rem; }
        .page-title { font-size: 1.4rem; margin-bottom: 0.5rem; }
        .page-subtitle { color: #888; font-size: 14px; margin-bottom: 2rem; }
        .step-card { background: #1a1a2e; border: 1px solid #2a2a3e; border-radius: 10px; padding: 24px; margin-bottom: 16px; display: flex; gap: 20px; align-items: flex-start; }
        .step-number { background: #4a90d9; color: #fff; font-size: 18px; font-weight: 700; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .step-content { flex: 1; }
        .step-content h3 { font-size: 1rem; margin-bottom: 6px; }
        .step-content p { color: #aaa; font-size: 14px; line-height: 1.5; margin-bottom: 12px; }
        .step-cta { display: inline-block; padding: 8px 20px; background: #4a90d9; border: none; border-radius: 6px; color: #fff; font-size: 13px; font-weight: 600; text-decoration: none; }
        .step-cta:hover { background: #3a7bc8; }
        .tips-card { background: #1a1a2e; border: 1px solid #2a2a3e; border-radius: 10px; padding: 24px; margin-top: 2rem; }
        .tips-card h3 { font-size: 1rem; margin-bottom: 12px; }
        .tips-card ul { list-style: none; padding: 0; }
        .tips-card li { color: #aaa; font-size: 14px; padding: 8px 0; border-bottom: 1px solid #2a2a3e; line-height: 1.5; }
        .tips-card li:last-child { border-bottom: none; }
        .tips-card li strong { color: #fff; }
        @media (max-width: 768px) {
            .header { flex-direction: column; gap: 10px; padding: 1rem; }
            .header-right { flex-wrap: wrap; justify-content: center; gap: 6px; }
            .container { padding: 1rem; }
            .step-card { flex-direction: column; gap: 12px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Collect Sync</h1>
        <div class="header-right">
            <a href="admin.html" class="btn">Dashboard</a>
            <a href="inventory.html" class="btn">Inventory</a>
            <a href="orders.html" class="btn">Orders</a>

            <div class="nav-dropdown">
                <div class="btn nav-dropdown-btn" onclick="toggleDropdown('sell-menu')">Selling &#9662;</div>
                <div class="nav-dropdown-menu" id="sell-menu">
                    <a href="marketplace.html">Marketplace</a>
                    <a href="live-sales.html">Live Sales</a>
                    <a href="shipping.html">Shipping</a>
                    <a href="customers.html">Customers</a>
                </div>
            </div>

            <div class="nav-dropdown">
                <div class="btn nav-dropdown-btn" onclick="toggleDropdown('buy-menu')">Buying &#9662;</div>
                <div class="nav-dropdown-menu" id="buy-menu">
                    <a href="buylist-review.html">Buylist Review</a>
                    <a href="buying.html">Buying Marketplace</a>
                    <a href="sell.html">Sell Cards Page</a>
                </div>
            </div>

            <div class="nav-dropdown">
                <div class="btn nav-dropdown-btn" onclick="toggleDropdown('tools-menu')">Tools &#9662;</div>
                <div class="nav-dropdown-menu" id="tools-menu">
                    <a href="analytics.html" data-feature="analytics">Analytics</a>
                    <a href="reports.html" data-feature="analytics">Reports</a>
                    <a href="price-alerts.html" data-feature="analytics">Price Alerts</a>
                    <div class="divider"></div>
                    <a href="grading.html" data-feature="grading_tracker">Grading Tracker</a>
                    <a href="integrations.html">Integrations</a>
                </div>
            </div>

            <span id="user-name" style="color:#aaa;font-size:13px;"></span>
            <button class="btn" onclick="logout()">Logout</button>
        </div>
    </div>

    <div class="container">
        <h2 class="page-title">Quickstart Guide</h2>
        <p class="page-subtitle">Get your card shop up and running in just a few minutes.</p>

        <div class="step-card">
            <div class="step-number">1</div>
            <div class="step-content">
                <h3>Add Your First Cards</h3>
                <p>Head to your inventory and start adding cards. Enter the card name, condition, price, and quantity. If you have a lot of cards, use the <strong>Import</strong> button to upload a CSV spreadsheet all at once.</p>
                <a href="inventory.html" class="step-cta">Go to Inventory</a>
            </div>
        </div>

        <div class="step-card">
            <div class="step-number">2</div>
            <div class="step-content">
                <h3>Set Up Your Online Store</h3>
                <p>Give your shop a name, pick a subdomain (like <strong>yourshop.collect-sync.com</strong>), and choose a theme. Once enabled, customers can browse and buy directly from your store.</p>
                <a href="integrations.html" class="step-cta">Set Up Store</a>
            </div>
        </div>

        <div class="step-card">
            <div class="step-number">3</div>
            <div class="step-content">
                <h3>Connect Your Selling Channels</h3>
                <p>Sync your inventory to <strong>eBay</strong>, <strong>Google Sheets</strong>, or <strong>Facebook</strong> so you can manage everything from one place. Connect an account and your listings stay in sync automatically.</p>
                <a href="integrations.html" class="step-cta">Go to Integrations</a>
            </div>
        </div>

        <div class="step-card">
            <div class="step-number">4</div>
            <div class="step-content">
                <h3>Manage Your Orders</h3>
                <p>When sales come in — from your store, eBay, or anywhere else — track them all in one place. Log orders, update statuses, and add shipping info right from the Orders page.</p>
                <a href="orders.html" class="step-cta">Go to Orders</a>
            </div>
        </div>

        <div class="tips-card">
            <h3>Tips for Getting the Most Out of Card Sync</h3>
            <ul>
                <li><strong>Use the price lookup</strong> when adding cards — it pulls live market prices so you can price competitively.</li>
                <li><strong>Set up stock alerts</strong> to get notified when inventory is running low.</li>
                <li><strong>Connect Stripe</strong> under Integrations to accept credit card payments on your store.</li>
                <li><strong>Upgrade your plan</strong> if you outgrow 250 cards — Pro ($29/mo) gives you 2,500 cards and Elite ($79/mo) is unlimited.</li>
            </ul>
        </div>
    </div>

    <script>
        const token = localStorage.getItem('auth_token');
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (!token) window.location.href = 'login.html';

        document.getElementById('user-name').textContent = user.email || '';

        function toggleDropdown(id) {
            const menu = document.getElementById(id);
            const wasOpen = menu.classList.contains('open');
            document.querySelectorAll('.nav-dropdown-menu').forEach(m => m.classList.remove('open'));
            if (!wasOpen) menu.classList.add('open');
        }
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.nav-dropdown')) {
                document.querySelectorAll('.nav-dropdown-menu').forEach(m => m.classList.remove('open'));
            }
        });

        function logout() {
            fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token }
            }).finally(() => {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user');
                window.location.href = 'login.html';
            });
        }
    </script>
</body>
</html>
```

- [ ] **Step 2: Verify the page loads locally**

Open `https://collect-sync.com/quickstart.html` (or local preview) while logged in. Confirm:
- Dark theme renders correctly
- All 4 step cards display with numbered badges
- CTA buttons link to correct pages
- Nav dropdowns work
- Redirects to login when not authenticated

- [ ] **Step 3: Commit**

```bash
git add quickstart.html
git commit -m "Add quickstart guide page"
```

---

### Task 2: Add welcome banner and help link to `admin.html`

**Files:**
- Modify: `admin.html:35-36` (CSS — add banner styles)
- Modify: `admin.html:97-98` (HTML — add help link in nav)
- Modify: `admin.html:103-104` (HTML — add banner above stats grid)
- Modify: `admin.html:160-167` (JS — add banner dismiss + show logic)

- [ ] **Step 1: Add banner CSS**

In `admin.html`, add the following CSS rules before the `@media` block (before line 50):

```css
        .welcome-banner { background: linear-gradient(135deg, #1a2a4a, #1a1a2e); border: 1px solid #4a90d9; border-radius: 10px; padding: 20px 24px; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; }
        .welcome-banner-text { font-size: 15px; color: #ccc; }
        .welcome-banner-text strong { color: #fff; }
        .welcome-banner-actions { display: flex; gap: 10px; align-items: center; }
        .welcome-banner .dismiss { background: none; border: none; color: #666; font-size: 18px; cursor: pointer; padding: 4px 8px; }
        .welcome-banner .dismiss:hover { color: #aaa; }
        .btn-help { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; padding: 0; }
```

- [ ] **Step 2: Add the help "?" link in the header nav**

In `admin.html`, insert the help button right before the `<span id="user-name"` element (line 99). Add between the admin link and the user-name span:

```html
            <a href="quickstart.html" class="btn btn-help" title="Quickstart Guide">?</a>
```

- [ ] **Step 3: Add the welcome banner HTML**

In `admin.html`, insert the banner between `<p class="welcome" ...>` (line 104) and the `<div class="stats-grid"` (line 106):

```html
        <div class="welcome-banner" id="welcome-banner" style="display:none;">
            <div class="welcome-banner-text"><strong>Welcome to Card Sync!</strong> Get your shop set up in just a few minutes.</div>
            <div class="welcome-banner-actions">
                <a href="quickstart.html" class="btn btn-primary">View Quickstart Guide</a>
                <button class="dismiss" onclick="dismissBanner()" title="Dismiss">&times;</button>
            </div>
        </div>
```

- [ ] **Step 4: Add banner JS logic**

In `admin.html`, add the following JS right after the `if (!token) window.location.href = 'login.html';` line (after line 164):

```javascript
        // Show welcome banner for new users
        if (!localStorage.getItem('quickstart_dismissed')) {
            document.getElementById('welcome-banner').style.display = '';
        }

        function dismissBanner() {
            localStorage.setItem('quickstart_dismissed', '1');
            document.getElementById('welcome-banner').style.display = 'none';
        }
```

- [ ] **Step 5: Verify banner behavior**

1. Clear `quickstart_dismissed` from localStorage in browser devtools
2. Reload `admin.html` — banner should appear above the stats grid
3. Click "View Quickstart Guide" — should navigate to `quickstart.html`
4. Go back, click the X to dismiss — banner should disappear
5. Reload — banner should stay hidden
6. Click the "?" button in nav — should navigate to `quickstart.html`

- [ ] **Step 6: Commit**

```bash
git add admin.html
git commit -m "Add welcome banner and help link to dashboard"
```

---

### Task 3: Send welcome email on signup

**Files:**
- Modify: `api/auth/signup.js:1-5` (add email import)
- Modify: `api/auth/signup.js:28-33` (add email send after success response setup)

- [ ] **Step 1: Add email import to signup.js**

At the top of `api/auth/signup.js`, add the email import after the existing imports (after line 2):

```javascript
const { sendEmail } = require('../../lib/email');
```

- [ ] **Step 2: Add the welcome email send**

In `api/auth/signup.js`, insert the email send after `const token = generateToken(...)` (line 26) and before the `return res.status(201)` (line 28). The email is wrapped in try/catch so a send failure does not block signup:

```javascript
        // Send welcome email (non-blocking — don't fail signup if email fails)
        try {
            const name = displayName || 'there';
            await sendEmail({
                to: email,
                subject: 'Welcome to Card Sync!',
                html: `
                    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;background:#1a1a2e;color:#fff;border-radius:12px;overflow:hidden;">
                        <div style="background:#4a90d9;padding:24px 30px;">
                            <h1 style="margin:0;font-size:22px;color:#fff;">Welcome to Card Sync!</h1>
                        </div>
                        <div style="padding:30px;">
                            <p style="color:#ccc;font-size:15px;line-height:1.6;margin:0 0 20px;">
                                Hey ${name}, welcome to the Card Sync community! You're all set to start managing your card inventory and selling across multiple channels. Here's how to get rolling:
                            </p>

                            <div style="margin-bottom:16px;padding:16px;background:#0d0d1a;border-radius:8px;border-left:3px solid #4a90d9;">
                                <strong style="color:#fff;font-size:14px;">Step 1: Add your cards</strong>
                                <p style="color:#aaa;font-size:13px;margin:6px 0 0;line-height:1.5;">Head to Inventory and start adding cards — or import a CSV if you've got a big collection.</p>
                            </div>

                            <div style="margin-bottom:16px;padding:16px;background:#0d0d1a;border-radius:8px;border-left:3px solid #4a90d9;">
                                <strong style="color:#fff;font-size:14px;">Step 2: Set up your store</strong>
                                <p style="color:#aaa;font-size:13px;margin:6px 0 0;line-height:1.5;">Pick a subdomain, choose a theme, and launch your online storefront in minutes.</p>
                            </div>

                            <div style="margin-bottom:24px;padding:16px;background:#0d0d1a;border-radius:8px;border-left:3px solid #4a90d9;">
                                <strong style="color:#fff;font-size:14px;">Step 3: Connect your channels</strong>
                                <p style="color:#aaa;font-size:13px;margin:6px 0 0;line-height:1.5;">Link eBay, Google Sheets, or Facebook to sync your inventory everywhere you sell.</p>
                            </div>

                            <div style="text-align:center;margin:24px 0;">
                                <a href="https://collect-sync.com/quickstart.html" style="display:inline-block;padding:12px 28px;background:#4a90d9;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">See the Full Guide</a>
                            </div>

                            <p style="color:#888;font-size:13px;line-height:1.5;margin:20px 0 0;">
                                Happy selling!<br>
                                <strong style="color:#aaa;">The Card Sync Team</strong>
                            </p>
                        </div>
                    </div>
                `
            });
        } catch (emailErr) {
            console.error('Welcome email failed (non-blocking):', emailErr);
        }
```

- [ ] **Step 3: Verify the complete signup.js looks correct**

The final file should read (top to bottom):
1. Imports: `createUser`, `generateToken`, `setCorsHeaders`, `sendEmail`
2. Handler: CORS → OPTIONS → method check → validate → `createUser()` → `generateToken()` → send welcome email (try/catch) → return 201 → error catch block

- [ ] **Step 4: Commit**

```bash
git add api/auth/signup.js
git commit -m "Send welcome email on signup"
```

---

### Task 4: Delete QUICKSTART.md and final cleanup

**Files:**
- Delete: `QUICKSTART.md`

- [ ] **Step 1: Remove the markdown quickstart file**

```bash
git rm QUICKSTART.md
```

- [ ] **Step 2: Commit**

```bash
git commit -m "Remove QUICKSTART.md — replaced by in-app quickstart page"
```

- [ ] **Step 3: Final verification**

1. Sign out and create a new test account at `/signup` — confirm welcome email arrives with 3 inline steps and CTA button
2. After signup redirect, confirm the welcome banner shows on the dashboard
3. Click "View Quickstart Guide" from the banner — lands on `/quickstart.html` with 4 step cards
4. Click "?" in the nav — also lands on `/quickstart.html`
5. Dismiss the banner, reload — stays dismissed
6. Click CTA buttons on the quickstart page — all link to correct pages
