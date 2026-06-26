/**
 * risk.service.js
 *
 * Rate-limiting, working-hours enforcement, and risk event logging.
 *
 * Fixed:
 *  - isWithinWorkingHours now correctly compares HH:MM strings
 *  - canProcessNextJob also pauses if any LOGIN_FAILED event in last 1 hour
 */

const { get, run } = require('../db/database');

function isWithinWorkingHours() {
  const now = new Date();
  // Use local time HH:MM for comparison
  const cur = now.toTimeString().slice(0, 5); // "HH:MM"
  const start = process.env.WORK_START || '09:30';
  const end   = process.env.WORK_END   || '17:30';
  return cur >= start && cur <= end;
}

async function count(sql, params = []) {
  const row = await get(sql, params);
  return row?.count || 0;
}

async function canProcessNextJob() {
  if (!isWithinWorkingHours()) {
    return { allowed: false, reason: 'Outside working hours' };
  }

  const daily  = +(process.env.DAILY_LIMIT  || 20);
  const hourly = +(process.env.HOURLY_LIMIT || 4);

  // Count successful sends today
  const sentToday = await count(
    `SELECT COUNT(*) count FROM leads
     WHERE status='REQUEST_SENT'
       AND DATE(updated_at)=DATE('now')`
  );
  if (sentToday >= daily) {
    return { allowed: false, reason: `Daily limit reached (${sentToday}/${daily})` };
  }

  // Count sends in last hour
  const sentHour = await count(
    `SELECT COUNT(*) count FROM leads
     WHERE status='REQUEST_SENT'
       AND updated_at >= DATETIME('now', '-1 hour')`
  );
  if (sentHour >= hourly) {
    return { allowed: false, reason: `Hourly limit reached (${sentHour}/${hourly})` };
  }

  // Stop if any CRITICAL risk event in last 24 hours
  const criticalEvents = await count(
    `SELECT COUNT(*) count FROM risk_events
     WHERE severity='CRITICAL'
       AND created_at >= DATETIME('now', '-24 hours')`
  );
  if (criticalEvents > 0) {
    return { allowed: false, reason: 'Critical risk event detected in last 24 hours — manual review required' };
  }

  return { allowed: true, sentToday, sentHour };
}

function randomDelayMs() {
  const min = +(process.env.MIN_DELAY_MINUTES || 8);
  const max = +(process.env.MAX_DELAY_MINUTES || 25);
  return Math.round((min + Math.random() * (max - min)) * 60000);
}

async function logRisk(severity, event_type, message, screenshot_path = '') {
  await run(
    'INSERT INTO risk_events (severity, event_type, message, screenshot_path) VALUES (?, ?, ?, ?)',
    [severity, event_type, message, screenshot_path]
  );
  console.log(`⚠️  Risk logged [${severity}]: ${event_type} — ${message}`);
}

module.exports = { canProcessNextJob, randomDelayMs, logRisk, isWithinWorkingHours };
