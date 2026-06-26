/**
 * campaign.routes.js
 *
 * Campaign control: pause, resume, requeue lead.
 *
 * Fixed:
 *  - Requeue now checks for existing QUEUED job before inserting (prevents duplicates)
 *  - Error handling added to all routes
 */

const express = require('express');
const { run, get } = require('../db/database');

const router = express.Router();

// Pause a campaign
router.post('/pause/:id', async (req, res) => {
  try {
    await run("UPDATE campaigns SET status='PAUSED' WHERE id=?", [req.params.id]);
    res.redirect('/');
  } catch (err) {
    console.error('Pause error:', err);
    res.status(500).send('Failed to pause campaign: ' + err.message);
  }
});

// Resume a campaign
router.post('/resume/:id', async (req, res) => {
  try {
    await run("UPDATE campaigns SET status='ACTIVE' WHERE id=?", [req.params.id]);
    res.redirect('/');
  } catch (err) {
    console.error('Resume error:', err);
    res.status(500).send('Failed to resume campaign: ' + err.message);
  }
});

/**
 * Requeue a failed/stuck lead for retry.
 * Fixed: Guard against creating duplicate QUEUED jobs for the same lead.
 */
router.post('/requeue/:leadId', async (req, res) => {
  try {
    const leadId = req.params.leadId;

    // Check if there is already a QUEUED or PROCESSING job for this lead
    const existing = await get(
      `SELECT id FROM outreach_jobs
       WHERE lead_id=? AND status IN ('QUEUED', 'PROCESSING')`,
      [leadId]
    );

    if (existing) {
      console.log(`Lead ${leadId} already has a pending job — skipping requeue`);
      return res.redirect('/?requeue=already_queued');
    }

    // Reset lead status and insert a new job
    await run(
      "UPDATE leads SET status='MESSAGE_READY', error_reason='', updated_at=DATETIME('now') WHERE id=?",
      [leadId]
    );

    await run(
      `INSERT INTO outreach_jobs (lead_id, campaign_id, status, scheduled_at)
       SELECT id, campaign_id, 'QUEUED', DATETIME('now')
       FROM leads WHERE id=?`,
      [leadId]
    );

    res.redirect('/');
  } catch (err) {
    console.error('Requeue error:', err);
    res.status(500).send('Failed to requeue lead: ' + err.message);
  }
});

module.exports = router;
