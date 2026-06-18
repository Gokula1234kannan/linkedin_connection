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

## Commands
- `npm start` dashboard
- `npm run worker` outreach worker
- `npm run init-db` initialize database
- `npm run sample` create sample Excel after dependencies are installed
