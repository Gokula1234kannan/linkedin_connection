/**
 * quickconnect.routes.js
 *
 * Handles the "Quick Connect" feature:
 *   - Accept a single LinkedIn profile URL via the dashboard form
 *   - Attach a standard connection message template
 *   - Run browser automation inline and return the result
 */

const express = require('express');
const { run, get } = require('../db/database');
const { processLeadWithBrowser } = require('../services/playwright.service');
const { normalizeLinkedInUrl } = require('../services/excel.service');

const router = express.Router();

// ── Standard template ─────────────────────────────────────────────────────────
// Used when no OpenAI key is set, or for Quick Connect requests.
function buildStandardMessage(firstName) {
  const greeting = firstName ? `Hi ${firstName}` : 'Hi';
  return (
    `${greeting}! I came across your LinkedIn profile and would love to connect. ` +
    `I'm always keen to build meaningful professional relationships. ` +
    `Looking forward to connecting with you!`
  ).slice(0, 299);
}

/**
 * Tries to extract a first name from a LinkedIn URL slug.
 * Works for hyphenated slugs (e.g. "john-doe" → "John").
 * Returns null for concatenated slugs (e.g. "johndoe").
 */
function extractFirstName(linkedinUrl) {
  try {
    const slug = linkedinUrl
      .split('linkedin.com/in/')[1]
      ?.replace(/\//g, '')
      .split('?')[0] || '';

    if (slug.includes('-')) {
      const part = slug.split('-')[0];
      return part.charAt(0).toUpperCase() + part.slice(1);
    }
    // Cannot reliably split "kannankaruppaiya" → return null, use generic greeting
    return null;
  } catch {
    return null;
  }
}

// ── POST /quick-connect ───────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const rawUrl     = (req.body.linkedin_url || '').trim();
  const linkedinUrl = normalizeLinkedInUrl(rawUrl);

  if (!linkedinUrl || !linkedinUrl.toLowerCase().includes('linkedin.com/in/')) {
    return res.redirect('/?qc_error=' + encodeURIComponent('Invalid LinkedIn URL. Use https://www.linkedin.com/in/username/'));
  }

  try {
    // Check if this person was already sent a request
    const existing = await get(
      "SELECT id, status FROM leads WHERE linkedin_url=?",
      [linkedinUrl]
    );
    if (existing && existing.status === 'REQUEST_SENT') {
      return res.redirect(`/?qc_result=ALREADY_SENT&qc_url=${encodeURIComponent(linkedinUrl)}`);
    }
    if (existing && existing.status === 'ALREADY_CONNECTED') {
      return res.redirect(`/?qc_result=ALREADY_CONNECTED&qc_url=${encodeURIComponent(linkedinUrl)}`);
    }

    const firstName = extractFirstName(linkedinUrl);
    const message   = buildStandardMessage(firstName);

    // Ensure a "Quick Connect" campaign exists
    let campaign = await get("SELECT id FROM campaigns WHERE name='Quick Connect' LIMIT 1");
    if (!campaign) {
      const r = await run(
        "INSERT INTO campaigns (name, status, daily_limit, hourly_limit) VALUES ('Quick Connect', 'ACTIVE', 50, 10)"
      );
      campaign = { id: r.lastID };
    }

    // Upsert the lead record
    let leadId;
    if (existing) {
      leadId = existing.id;
      await run(
        "UPDATE leads SET status='MESSAGE_READY', message=?, error_reason='', updated_at=DATETIME('now') WHERE id=?",
        [message, leadId]
      );
    } else {
      const inserted = await run(
        `INSERT INTO leads
           (campaign_id, first_name, last_name, company, linkedin_url, message, status)
         VALUES (?, ?, '', '', ?, ?, 'MESSAGE_READY')`,
        [campaign.id, firstName || 'Connection', linkedinUrl, message]
      );
      leadId = inserted.lastID;
    }

    console.log(`\n⚡ Quick Connect → ${linkedinUrl}`);
    console.log(`   Message: "${message}"`);

    // ── Run browser automation INLINE (with timeout protection) ──────────────
    // If Playwright hangs (slow LinkedIn, network issue) the HTTP request would
    // otherwise hang indefinitely → browser shows a generic 502.
    // We race against a 120s timeout to always return a clean response.
    const lead = {
      id:           leadId,
      first_name:   firstName || '',
      last_name:    '',
      company:      '',
      linkedin_url: linkedinUrl,
      message:      message,
    };

    const TIMEOUT_MS = 180_000; // 180s — allows for login check + navigation + warm-up (22-38s) + interaction
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Browser automation timed out after 180s')), TIMEOUT_MS)
    );

    const result = await Promise.race([
      processLeadWithBrowser(lead),
      timeoutPromise,
    ]);

    // Save result to DB
    await run(
      "UPDATE leads SET status=?, error_reason=?, updated_at=DATETIME('now') WHERE id=?",
      [result.status, result.error || '', leadId]
    );

    // Record in outreach_jobs for history
    await run(
      `INSERT INTO outreach_jobs
         (lead_id, campaign_id, status, scheduled_at, started_at, finished_at, error_reason, screenshot_path)
       VALUES (?, ?, ?, DATETIME('now'), DATETIME('now'), DATETIME('now'), ?, ?)`,
      [leadId, campaign.id, result.status, result.error || '', result.screenshotPath || '']
    );

    const encoded = encodeURIComponent(linkedinUrl);
    res.redirect(`/?qc_result=${result.status}&qc_url=${encoded}&qc_error=${encodeURIComponent(result.error || '')}`);

  } catch (err) {
    console.error('Quick connect error:', err);
    res.redirect(`/?qc_error=${encodeURIComponent(err.message)}`);
  }
});

module.exports = router;
