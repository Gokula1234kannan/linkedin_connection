# CLAUDE.md — LinkedIn Connection Engine

This file provides essential context for AI assistants working on this project.
Keep this file updated whenever significant changes are made.

---

## Project Overview

**LinkedIn Connection Engine** — A Node.js / Express web application that automates LinkedIn connection requests via Playwright browser automation, with a SQLite job queue, Excel import, rate limiting, and full anti-detection hardening.

**Dashboard**: `http://localhost:3000`
**Worker**: Run separately via `npm run worker`

---

## Stack

| Layer | Technology |
|---|---|
| Web Server | Express 4, EJS templates |
| Database | SQLite 3 (WAL mode, `data.sqlite`) |
| Browser Automation | Playwright (persistent Chrome profile) |
| CDP-Level Patch | `rebrowser-playwright` (patches Runtime.enable leak) |
| JS-Layer Stealth | `playwright-extra` + `puppeteer-extra-plugin-stealth` |
| Fingerprinting | `fingerprint-generator` + `fingerprint-injector` |
| Natural Mouse | `ghost-cursor-playwright` |
| Rate Limiting | `risk.service.js` (daily/hourly limits, working hours) |
| Excel Import | `xlsx` library, `excel.service.js` (flexible column mapping) |
| JSON API | `api.routes.js` — `/api/stats`, `/api/leads`, `/api/worker-status`, `/api/activity` |
| Real-Time UI | Dashboard polls API every 3-8s, updates DOM in-place without page reload |

---

## Directory Structure

```
Linkedin_connection/
├── src/
│   ├── app.js                        # Express entry point
│   ├── db/
│   │   ├── database.js               # SQLite helpers (run/get/all), WAL mode init
│   │   └── schema.sql                # All table definitions
│   ├── routes/
│   │   ├── dashboard.routes.js       # GET / — main dashboard view
│   │   ├── upload.routes.js          # POST /upload — Excel file upload + dedup + job queue
│   │   ├── campaign.routes.js        # Campaign CRUD
│   │   ├── quickconnect.routes.js    # POST /quick-connect — inline single profile (120s timeout)
│   │   └── api.routes.js             # GET /api/* — JSON endpoints for real-time dashboard polling
│   ├── services/
│   │   ├── playwright.service.js     # 🔑 Core browser automation (login, navigate, send)
│   │   ├── stateDetector.service.js  # Detects profile state (CONNECT/PENDING/CONNECTED/etc.)
│   │   ├── stealth.service.js        # Chrome args + fingerprint-injector patches
│   │   ├── humanBehavior.service.js  # Gaussian delays, Bézier mouse, ghost-cursor, typing
│   │   ├── risk.service.js           # Rate limits, working hours, risk event logging
│   │   ├── excel.service.js          # Flexible column mapping for Excel/CSV import
│   │   ├── lead.service.js           # Lead DB helpers (validateLead, createLeadKey)
│   │   └── message.service.js        # OpenAI message generation (optional)
│   ├── views/
│   │   ├── dashboard.ejs             # Main UI — campaigns, quick connect, risk events
│   │   └── risk-events.ejs           # Risk events table view
│   └── workers/
│       └── outreach.worker.js        # Background job queue processor
├── scripts/
│   ├── validate.js                   # Syntax check all .js files
│   ├── check-playwright.js           # Verify Playwright browser install
│   └── create-sample-excel.js        # Generate a sample leads.xlsx
├── browser-profile/                  # Persistent Chrome session (login state saved here)
├── screenshots/                      # Auto-saved debug/failure screenshots
├── uploads/                          # Uploaded Excel files (temp files deleted after parse)
├── .env                              # Environment variables (credentials, limits)
├── .env.example                      # Template for .env
├── package.json
└── test-send-connection.js           # Standalone E2E test script
```

---

## Environment Variables (`.env`)

```
PORT=3000
DATABASE_PATH=./data.sqlite
UPLOAD_DIR=./uploads
SCREENSHOT_DIR=./screenshots
BROWSER_PROFILE_DIR=./browser-profile

LINKEDIN_EMAIL=...
LINKEDIN_PASSWORD=...

DAILY_LIMIT=20
HOURLY_LIMIT=4
MIN_DELAY_MINUTES=8
MAX_DELAY_MINUTES=25

WORK_START=09:30
WORK_END=17:30

OPENAI_API_KEY=   # optional — enables AI-generated messages
```

---

## Database Schema (SQLite)

```
campaigns       — id, name, status, daily_limit, hourly_limit
leads           — id, campaign_id, first_name, last_name, company, job_title,
                   linkedin_url, email, location, notes, message, status, error_reason
outreach_jobs   — id, lead_id, campaign_id, status (QUEUED/PROCESSING/REQUEST_SENT/FAILED/...)
activity_logs   — id, lead_id, event_type, message
risk_events     — id, severity, event_type, message, screenshot_path
system_state    — key/value store (worker state)
```

**Lead status values**: `IMPORTED`, `VALIDATED`, `MESSAGE_READY`, `PROCESSING`, `REQUEST_SENT`, `ALREADY_CONNECTED`, `ALREADY_PENDING`, `FOLLOW_ONLY`, `FAILED`, `RISK_DETECTED`, `LOGIN_FAILED`, `INVALID`, `DUPLICATE`

---

## Anti-Detection Architecture (Defence-in-Depth)

The project uses **4 independent security layers** stacked on top of each other:

### Layer 1 — CDP Patch: `rebrowser-playwright`
- **GitHub**: [rebrowser/rebrowser-patches](https://github.com/rebrowser/rebrowser-patches)
- **What it fixes**: LinkedIn detects standard Playwright via the `Runtime.enable` Chrome DevTools Protocol command leaking during page loads. This is a **binary-level patch** — it cannot be detected from JS.
- **Imported as**: `const { chromium: rebrowserChromium } = require('rebrowser-playwright')`

### Layer 2 — JS Stealth Battery: `playwright-extra` + stealth plugin
- **GitHub**: [berstend/puppeteer-extra](https://github.com/berstend/puppeteer-extra)
- **What it fixes**: JS-detectable signals — `navigator.webdriver`, iframe contentWindow discrepancies, `window.chrome.runtime`, Permissions API, plugin arrays, language lists, WebGL fingerprint consistency
- **Applied as**: `extraChromium.use(StealthPlugin())`

### Layer 3 — Fingerprint Injection: `fingerprint-generator` + `fingerprint-injector`
- **GitHub**: [apify/fingerprint-suite](https://github.com/apify/fingerprint-suite)
- **What it fixes**: Canvas fingerprint, WebGL vendor/renderer, User-Agent, screen dimensions — generates a complete realistic browser fingerprint per session
- **Applied via**: `applyStealthToContext(context, fingerprint)` in `stealth.service.js`

### Layer 4 — Human Behaviour: `ghost-cursor-playwright` + `humanBehavior.service.js`
- **GitHub**: [Xetera/ghost-cursor](https://github.com/Xetera/ghost-cursor)
- **What it fixes**: Behavioural ML detection — mouse movement patterns, typing speed/rhythm, scroll inertia, session warm-up, reading simulation
- **Applied via**: `page.cursor = await createCursor(page)`

---

## Browser Launch Strategy (`playwright.service.js`)

The browser is launched using a **3-tier fallback** to maximise both security and reliability:

```
Tier 1: rebrowserChromium.launchPersistentContext({ channel: 'chrome' })
         → CDP-patched + real Chrome browser profile (BEST)

Tier 2: extraChromium.launchPersistentContext({ channel: 'chrome' })
         → JS stealth plugin + real Chrome (if rebrowser fails)

Tier 3: extraChromium.launchPersistentContext({})
         → JS stealth plugin + bundled Chromium (last resort)
```

After launch, `applyStealthToContext()` injects the fingerprint on top of whichever tier succeeded.

---

## Core Service: `playwright.service.js`

The most important file. Exports `processLeadWithBrowser(lead)`.

### Pipeline (in order)

1. **Generate fingerprint** via `fingerprint-generator` (UA, screen, Canvas, WebGL)
2. **Launch Chrome** via 3-tier security strategy (see above)
3. **Inject fingerprint** via `fingerprint-injector` (`applyStealthToContext`)
4. **Init ghost-cursor** on the page for natural mouse paths
5. **Navigate to `/feed/`** and call `ensureLoggedIn(page)`
6. **Session warm-up** (80% chance): Browse feed 22–38s before visiting profile
7. **Navigate to profile** and call `readProfile(page)` (scroll + idle mouse drift)
8. **Detect state** via `detectPageState(page)`
9. **Handle state** — skip if ALREADY_CONNECTED / ALREADY_PENDING / FOLLOW_ONLY
10. **Send connection** via `sendConnectionWithNote(page, lead)`

### `isLoggedIn(page)` — Important

Uses `Promise.race` to wait up to 5s for either a logged-in element (`.global-nav`) OR a login-page indicator. **Do not simplify this back to a URL-only check** — the page redirects asynchronously.

---

## State Detector: `stateDetector.service.js`

**Detection order matters — do not change it without good reason:**

1. URL check → `FRICTION_DETECTED` (checkpoint/challenge URL)
2. URL check → `LOGIN_REQUIRED`
3. URL check → `UNKNOWN` (not a `/in/` profile URL)
4. Body text scan → `FRICTION_DETECTED` (multi-word phrases only)
5. Body text → `LOGIN_REQUIRED`
6. Button: `Pending` / `invitation sent` → `ALREADY_PENDING`
7. Button: `Connect` (direct) → `CONNECT_AVAILABLE via direct`
8. Button: `Message` → `ALREADY_CONNECTED` ← **must be before More button check**
9. Button: `More` → `CONNECT_AVAILABLE via more_menu`
10. Button: `+ Follow` only → `FOLLOW_ONLY`
11. Fallback → `UNKNOWN`

### Friction Signals (multi-word only)
```js
'security verification', 'verify your identity', 'verify your phone',
'unusual activity detected', 'temporarily restricted',
'your account has been restricted', 'limited your account',
'weekly invitation limit', 'out of invitations',
'reached the weekly limit', 'we noticed unusual'
```
> ⚠️ Never add single words like `checkpoint` — LinkedIn's own JS contains it.

---

## `stealth.service.js` — Chrome Args

Chrome launch args are grouped by purpose (sourced from rebrowser/patchright research):
- **Core automation flags**: `--disable-blink-features=AutomationControlled`, `--exclude-switches=enable-automation`
- **Headless/detection evasion**: `--disable-features=ChromeWhatsNewUI`, `--disable-features=MediaRouter`, `--disable-client-side-phishing-detection`
- **Process isolation**: `--disable-dev-shm-usage`, `--no-sandbox`, `--disable-ipc-flooding-protection`
- **Media normalisation**: `--use-fake-ui-for-media-stream`, `--use-fake-device-for-media-stream`

---

## Risk Service: `risk.service.js`

Enforces:
- **Working hours** (env `WORK_START` / `WORK_END`)
- **Daily limit** — `DAILY_LIMIT` successful sends per day
- **Hourly limit** — `HOURLY_LIMIT` sends per hour
- **Critical pause** — stops all processing for 24h if any `CRITICAL` severity risk event exists

---

## Background Worker: `outreach.worker.js`

- Runs as a **separate process**: `npm run worker`
- Polls the `outreach_jobs` table for `QUEUED` jobs
- Resets stuck `PROCESSING` jobs on startup (crash recovery)
- On `RISK_DETECTED` or `LOGIN_FAILED`: pauses for **30 minutes**
- On normal completion: waits `randomDelayMs()` before next job
- Supports `--once` flag to process a single job and exit

---

## NPM Scripts

```
npm start              # Start web server (src/app.js)
npm run worker         # Start background outreach worker
npm run dev            # Start web server with nodemon hot-reload
npm run validate       # Syntax check all .js files
npm run sample         # Generate sample_leads.xlsx
npm run check-playwright  # Verify Playwright Chrome install
```

---

## Key Dependencies

```
rebrowser-playwright          # CDP-level Runtime.enable leak patch (rebrowser/rebrowser-patches)
playwright-extra              # Plugin system wrapper for Playwright
playwright-extra-plugin-stealth  # Full JS stealth battery (berstend/puppeteer-extra)
playwright                    # Base browser automation (fallback)
ghost-cursor-playwright       # Natural Bézier mouse paths (Xetera/ghost-cursor)
fingerprint-generator         # Realistic browser fingerprint generation (apify/fingerprint-suite)
fingerprint-injector          # Injects fingerprints into Playwright context
express                       # Web server
ejs                           # Templating
sqlite3                       # Database
multer                        # File upload handling
xlsx                          # Excel/CSV parsing
openai                        # AI message generation (optional)
dotenv                        # Environment configuration
```

---

## Common Issues & Fixes

### Auto-login fails (`Email field not found`)
Browser session already logged in but page redirected before `isLoggedIn` resolved. `isLoggedIn` uses `Promise.race` — should not recur. Check `BROWSER_PROFILE_DIR` path.

### `RISK_DETECTED` false positive
Caused by single-word `checkpoint` in body text scan. Fixed — only multi-word phrases checked.

### `"Send" button not found`
Check `sendSelectors` in `sendConnectionWithNote`. Most reliable: `button[aria-label="Send invitation"]`.

### `"Connect" not found in More dropdown`
1. Already connected (1st degree) — detected via Message button check first.
2. Creator/follow-only profile — detected via `+ Follow` button → `FOLLOW_ONLY`.

### rebrowser-playwright fails to launch
Falls back to `playwright-extra` with stealth plugin automatically. Check Chrome is installed.

---

## Testing

### Syntax validation
```powershell
node scripts/validate.js
```

### E2E test (standalone, no server needed)
```powershell
node test-send-connection.js
```

### Direct service test (bypass routes/worker)
```powershell
node -e "
require('dotenv').config();
const {processLeadWithBrowser} = require('./src/services/playwright.service');
processLeadWithBrowser({id:99, first_name:'Test', last_name:'User', company:'', linkedin_url:'https://www.linkedin.com/in/SLUG/', message:'Hi!'}).then(console.log);
"
```

---

## Last Updated
2026-06-24 — Gap fixes: Added JSON API layer (`api.routes.js`) with `/api/stats`, `/api/leads`, `/api/worker-status`, `/api/activity`. Dashboard now polls every 3-8s for real-time updates with row flash animations and worker status bar. Worker writes heartbeat to `system_state` every 30s and activity logs on each job. Quick Connect has 120s `Promise.race` timeout. All security packages corrected: `puppeteer-extra-plugin-stealth@2.11.2` (was a placeholder v0.0.1).
