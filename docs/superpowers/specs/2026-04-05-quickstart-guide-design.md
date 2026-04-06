# Quickstart Guide — Design Spec

**Date:** 2026-04-05
**Goal:** Help non-technical users get up and running quickly via an in-app guide page and a welcome email sent at signup.

---

## 1. In-App Quickstart Page (`quickstart.html`)

New authenticated HTML page following existing site patterns (embedded CSS, dark theme, vanilla JS, header nav).

**Layout:** Numbered step cards in a vertical flow. Each card contains:
- Step number badge
- Title and 2-3 sentence description
- CTA button linking to the relevant page

**Steps:**
1. **Add Your First Cards** — CTA: "Go to Inventory" → `inventory.html`
2. **Set Up Your Online Store** — CTA: "Go to Integrations" → `integrations.html`
3. **Connect Your Selling Channels** — CTA: "Go to Integrations" → `integrations.html`
4. **Manage Your Orders** — CTA: "Go to Orders" → `orders.html`

**Footer section:** Tips block covering price lookup, stock alerts, Stripe, plan upgrades.

**Auth:** Checks `localStorage` for `auth_token`, redirects to `login.html` if missing.

**Nav:** Standard site header with logo, nav links, user name, logout. Includes same dropdown structure as other authenticated pages.

---

## 2. Dashboard Welcome Banner (`admin.html`)

Dismissible banner inserted above the stats grid for new users.

- Text: "Welcome to Card Sync! Get set up in minutes."
- CTA button: "View Quickstart Guide" → `quickstart.html`
- Dismiss (X button) saves `quickstart_dismissed` to `localStorage`
- On page load, banner is hidden if `localStorage.getItem('quickstart_dismissed')` is truthy

---

## 3. Help Nav Link (`admin.html`)

Add a "?" styled button in the header nav linking to `quickstart.html`. Placed at the right side of the nav, before the user name/logout area.

---

## 4. Welcome Email (signup flow)

**Trigger:** Sent after successful user creation in `api/auth/signup.js`, using existing `sendEmail()` from `lib/email.js`.

**Tone:** Warm, encouraging, community-oriented.

**Content structure (hybrid):**
- Greeting: "Welcome to Card Sync, {displayName}!"
- Brief intro paragraph
- Top 3 steps inline:
  1. Add your cards to inventory
  2. Set up your online store
  3. Connect eBay or other channels
- CTA button: "See the Full Guide" → `https://collect-sync.com/quickstart.html`
- Sign-off: "Happy selling! — The Card Sync Team"

**Styling:** Inline CSS for email compatibility. Simple layout — no complex tables. Matches dark brand colors where safe for email clients.

**Error handling:** Email send failure should NOT block signup. Wrap in try/catch, log error, continue returning success to the user.

---

## Files

| Action | File |
|--------|------|
| Create | `quickstart.html` |
| Modify | `admin.html` — add welcome banner + help nav link |
| Modify | `api/auth/signup.js` — send welcome email |
| Delete | `QUICKSTART.md` — replaced by HTML page |

---

## Out of scope

- Email verification flow (already exists separately)
- Onboarding wizard / multi-step modal
- Help/FAQ beyond the quickstart content
- Adding the help link to every authenticated page (start with admin.html only)
