# LinkedIn Connection Engine

Excel-driven MVP with Node.js, Express, SQLite, OpenAI message generation, Playwright profile opening, queueing, dashboard, report export, and risk auto-pause.

## Safety boundary
This app does not bypass captchas, LinkedIn security checks, rate-limit warnings, or restrictions. The Playwright worker opens approved profile URLs, detects state, logs risk, and pauses on friction.

## Setup

```bash
cd C:\Users\Kannan\Documents\Linkedin_connection
copy .env.example .env
npm install
npx playwright install chromium
npm run init-db
npm start
```

Open: http://localhost:3000

Worker in another terminal:

```bash
cd C:\Users\Kannan\Documents\Linkedin_connection
npm run worker
```

## Excel columns
Required: `first_name`, `last_name`, `company`
Optional: `job_title`, `linkedin_url`, `email`, `location`, `notes`

## Workflow
1. Upload Excel in dashboard.
2. App validates/dedupes rows.
3. App generates connection messages, using OpenAI if configured or fallback templates.
4. Leads with LinkedIn URLs are queued.
5. Worker opens profile in a persistent browser profile.
6. Worker detects connected/pending/connect available/risk states.
7. App updates dashboard and export report.

## Browser Profile (`/browser-profile`)
The `browser-profile` folder is a persistent Chrome browser profile used by Playwright. It acts as a saved copy of a real Chrome browser session.

### What it stores:
| File/Data | Purpose |
| --- | --- |
| **Cookies & Sessions** | Keeps you logged into LinkedIn so the bot doesn't need to re-login every run. |
| **Local Storage** | LinkedIn's app state and preferences. |
| **Cache** | Speeds up page loads. |
| **IndexedDB** | Browser-side database used by LinkedIn. |
| **Last Browser** | Tracks which browser version was last used. |

### Why it matters:
- **Without it:** Every time the worker runs, it would open a fresh Chrome with no cookies. LinkedIn would see a new device login, leading to a possible security challenge or CAPTCHA.
- **With it:** Playwright opens Chrome with your saved session. LinkedIn sees the same "device" and "fingerprint" every time, meaning no re-login and no suspicious activity.

### How it is created:
The first time you run the automation and log in to LinkedIn, Playwright saves the session to this folder automatically via:
```javascript
chromium.launchPersistentContext('./browser-profile', { ... })
```

### Security Note:
This folder is included in `.gitignore` because it contains your active LinkedIn login session token. If pushed to GitHub, anyone could steal your session and access your LinkedIn account without a password.

## Commands
- `npm start` dashboard
- `npm run worker` outreach worker
- `npm run init-db` initialize database
- `npm run sample` create sample Excel after dependencies are installed
