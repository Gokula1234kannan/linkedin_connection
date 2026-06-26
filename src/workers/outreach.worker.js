/**
 * outreach.worker.js
 *
 * Background worker that processes the outreach job queue.
 * Runs as a separate Node.js process: `npm run worker`
 *
 * Fixed:
 *  - Resets stuck PROCESSING jobs on startup (handles crashes mid-job)
 *  - Logs LOGIN_FAILED as CRITICAL risk event
 *  - Proper REQUEST_SENT status update
 *  - Graceful shutdown on SIGINT / SIGTERM
 */

require('dotenv').config();

const { initDb, get, run, all } = require('../db/database');
const { canProcessNextJob, randomDelayMs, logRisk } = require('../services/risk.service');
const { processLeadWithBrowser } = require('../services/playwright.service');

// ── Initialise DB ─────────────────────────────────────────────────────────────
initDb();

const TEST_ONCE = process.argv.includes('--once');
let running = true;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Worker heartbeat ──────────────────────────────────────────────────────────
/**
 * Writes worker status to system_state table so the dashboard can display
 * live worker state without the worker process being directly accessible.
 */
async function setWorkerState(status, currentJob = '') {
  const now = new Date().toISOString();
  const upsert = (key, value) =>
    run(
      `INSERT INTO system_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      [key, value]
    );
  await Promise.all([
    upsert('worker_status',      status),
    upsert('worker_current_job', currentJob),
    upsert('worker_last_seen',   now),
  ]);
}

// ── Activity logger ───────────────────────────────────────────────────────────
/**
 * Writes a row to activity_logs so the dashboard can show a live feed
 * of what the worker has done recently.
 */
async function logActivity(leadId, eventType, message) {
  try {
    await run(
      `INSERT INTO activity_logs (lead_id, event_type, message) VALUES (?, ?, ?)`,
      [leadId || null, eventType, message]
    );
  } catch {
    // Non-fatal — don't crash the worker if activity logging fails
  }
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGINT',  () => { console.log('\n🛑 Worker stopping (SIGINT)...'); running = false; });
process.on('SIGTERM', () => { console.log('\n🛑 Worker stopping (SIGTERM)...'); running = false; });

// ── Reset stuck jobs ──────────────────────────────────────────────────────────
/**
 * If the worker crashed mid-job, outreach_jobs rows stay as PROCESSING forever.
 * On startup, reset them back to QUEUED so they get retried.
 */
async function resetStuckJobs() {
  const result = await run(
    `UPDATE outreach_jobs
     SET status='QUEUED', started_at=NULL, error_reason='Reset after crash'
     WHERE status='PROCESSING'`
  );
  if (result.changes > 0) {
    console.log(`♻️  Reset ${result.changes} stuck PROCESSING job(s) to QUEUED`);
    // Also reset lead status
    await run(
      `UPDATE leads
       SET status='MESSAGE_READY', updated_at=DATETIME('now')
       WHERE status='PROCESSING'`
    );
  }
}

// ── Queue helpers ─────────────────────────────────────────────────────────────

async function getNextJob() {
  return get(
    `SELECT
       jobs.id     AS job_id,
       leads.*
     FROM outreach_jobs jobs
     JOIN leads    ON leads.id    = jobs.lead_id
     JOIN campaigns ON campaigns.id = jobs.campaign_id
     WHERE jobs.status     = 'QUEUED'
       AND campaigns.status = 'ACTIVE'
       AND leads.linkedin_url IS NOT NULL
       AND leads.linkedin_url != ''
     ORDER BY jobs.created_at ASC
     LIMIT 1`
  );
}

async function markJobStarted(job) {
  await run(
    "UPDATE outreach_jobs SET status='PROCESSING', started_at=DATETIME('now') WHERE id=?",
    [job.job_id]
  );
  await run(
    "UPDATE leads SET status='PROCESSING', updated_at=DATETIME('now') WHERE id=?",
    [job.id]
  );
}

async function markJobFinished(job, result) {
  await run(
    `UPDATE outreach_jobs
     SET status=?, finished_at=DATETIME('now'), error_reason=?, screenshot_path=?
     WHERE id=?`,
    [result.status, result.error || '', result.screenshotPath || '', job.job_id]
  );
  await run(
    `UPDATE leads
     SET status=?, error_reason=?, updated_at=DATETIME('now')
     WHERE id=?`,
    [result.status, result.error || '', job.id]
  );

  // Log risky outcomes
  if (result.status === 'RISK_DETECTED') {
    await logRisk(
      result.severity || 'HIGH',
      'PLAYWRIGHT_FRICTION',
      result.error || 'Risk detected',
      result.screenshotPath || ''
    );
  }

  if (result.status === 'LOGIN_FAILED') {
    await logRisk(
      'CRITICAL',
      'LOGIN_FAILED',
      result.error || 'Login failed',
      result.screenshotPath || ''
    );
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function loop() {
  console.log('🚀 Outreach worker started');
  console.log('   LINKEDIN_EMAIL:', process.env.LINKEDIN_EMAIL || '(not set — will fail)');
  console.log('   DAILY_LIMIT:', process.env.DAILY_LIMIT || 20);
  console.log('   HOURLY_LIMIT:', process.env.HOURLY_LIMIT || 4);
  console.log('   WORK_HOURS:', `${process.env.WORK_START || '09:30'} – ${process.env.WORK_END || '17:30'}`);
  console.log('');

  // Give the DB a moment to finish WAL initialization
  await sleep(1000);

  // Write initial heartbeat so dashboard immediately sees worker as RUNNING
  await setWorkerState('RUNNING', '');
  await logActivity(null, 'WORKER_START', 'Worker process started');

  // Periodic heartbeat: update worker_last_seen every 30s so dashboard can detect if worker dies
  const heartbeatInterval = setInterval(() => setWorkerState('RUNNING').catch(() => {}), 30_000);

  // Reset any jobs that were stuck in PROCESSING (from a previous crash)
  await resetStuckJobs();

  while (running) {
    // ── Check rate limits and working hours ────────────────────────────────
    const risk = await canProcessNextJob();

    if (!risk.allowed) {
      console.log(`⏸  Paused: ${risk.reason}`);
      await setWorkerState('PAUSED', '');
      if (TEST_ONCE) break;
      await sleep(5 * 60 * 1000); // Check again in 5 minutes
      continue;
    }

    // ── Get next job ───────────────────────────────────────────────────────
    const job = await getNextJob();

    if (!job) {
      console.log('📭 No queued jobs. Waiting...');
      await setWorkerState('IDLE', '');
      if (TEST_ONCE) break;
      await sleep(60 * 1000); // Check again in 1 minute
      continue;
    }

    console.log(`\n▶  Processing job for: ${job.first_name} ${job.last_name} @ ${job.company}`);
    await setWorkerState('PROCESSING', `${job.first_name} ${job.last_name} @ ${job.company || job.linkedin_url}`);
    await logActivity(job.id, 'JOB_STARTED', `Processing: ${job.first_name} ${job.last_name} — ${job.linkedin_url}`);
    await markJobStarted(job);

    // ── Run the browser automation ─────────────────────────────────────────
    const result = await processLeadWithBrowser(job);

    // ── Save results ───────────────────────────────────────────────────────
    await markJobFinished(job, result);

    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} Result: ${result.status}${result.error ? ` — ${result.error}` : ''}`);
    await logActivity(
      job.id,
      result.success ? 'JOB_DONE' : 'JOB_FAILED',
      `${job.first_name} ${job.last_name}: ${result.status}${result.error ? ` — ${result.error}` : ''}`
    );

    if (TEST_ONCE) {
      clearInterval(heartbeatInterval);
      break;
    }

    // ── Wait before next job ───────────────────────────────────────────────
    if (result.status === 'RISK_DETECTED' || result.status === 'LOGIN_FAILED') {
      console.log('⏳ Risk detected — pausing for 30 minutes');
      await setWorkerState('RISK_PAUSE', result.error || 'Risk/login issue');
      await sleep(30 * 60 * 1000);
    } else {
      const delay = randomDelayMs();
      const minutes = Math.round(delay / 60000);
      console.log(`⏳ Waiting ${minutes} minutes before next lead...`);
      await setWorkerState('IDLE', `Next job in ~${minutes}min`);
      await sleep(delay);
    }
  }

  clearInterval(heartbeatInterval);
  await setWorkerState('STOPPED', '');
  await logActivity(null, 'WORKER_STOP', 'Worker process exited cleanly');

  console.log('👋 Worker exited cleanly.');
  process.exit(0);
}

loop().catch((err) => {
  console.error('💥 Worker crashed:', err);
  process.exit(1);
});
