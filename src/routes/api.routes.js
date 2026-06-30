/**
 * api.routes.js
 *
 * JSON API endpoints consumed by the dashboard's real-time polling JS.
 * All responses are JSON — no HTML rendering here.
 *
 * Endpoints:
 *   GET /api/stats          — Lead status counts
 *   GET /api/leads          — Last 200 leads
 *   GET /api/worker-status  — Worker heartbeat + current job info
 *   GET /api/activity       — Last 20 activity log entries
 */

const express = require('express');
const { all, get } = require('../db/database');

const router = express.Router();

// ── GET /api/stats ────────────────────────────────────────────────────────────
// Returns lead status counts grouped by status.
router.get('/stats', async (req, res) => {
  try {
    const stats = await all(
      'SELECT status, COUNT(*) AS count FROM leads GROUP BY status ORDER BY count DESC'
    );
    res.json({ ok: true, stats });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/leads ────────────────────────────────────────────────────────────
// Returns the last 200 leads ordered by most recently updated.
router.get('/leads', async (req, res) => {
  try {
    const leads = await all(
      'SELECT * FROM leads ORDER BY updated_at DESC, created_at DESC LIMIT 200'
    );
    res.json({ ok: true, leads });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/worker-status ────────────────────────────────────────────────────
// Reads worker heartbeat from system_state table.
// Worker writes these keys: worker_status, worker_current_job, worker_last_seen
router.get('/worker-status', async (req, res) => {
  try {
    const [status, currentJob, lastSeen, queuedCount] = await Promise.all([
      get("SELECT value FROM system_state WHERE key='worker_status'"),
      get("SELECT value FROM system_state WHERE key='worker_current_job'"),
      get("SELECT value FROM system_state WHERE key='worker_last_seen'"),
      get("SELECT COUNT(*) AS count FROM outreach_jobs WHERE status='QUEUED'"),
    ]);

    const lastSeenMs = lastSeen ? new Date(lastSeen.value).getTime() : null;
    const staleSec   = lastSeenMs ? Math.floor((Date.now() - lastSeenMs) / 1000) : null;

    // Worker is considered offline if no heartbeat in last 2 minutes
    const isOnline = staleSec !== null && staleSec < 120;

    res.json({
      ok: true,
      workerStatus:    isOnline ? (status?.value || 'UNKNOWN') : 'OFFLINE',
      currentJob:      currentJob?.value  || null,
      lastSeen:        lastSeen?.value    || null,
      staleSec,
      queuedCount:     queuedCount?.count || 0,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/activity ─────────────────────────────────────────────────────────
// Returns the 100 most recent activity log entries.
router.get('/activity', async (req, res) => {
  try {
    const activity = await all(
      'SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ ok: true, activity });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
