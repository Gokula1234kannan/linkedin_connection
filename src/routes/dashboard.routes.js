/**
 * dashboard.routes.js
 *
 * Dashboard, risk events view, and Excel export.
 *
 * Fixed:
 *  - XLSX imported only in the /export route (not loaded on every request)
 *  - Stats, campaigns, and leads fetched efficiently
 */

const express = require('express');
const { all } = require('../db/database');

const router = express.Router();

// Main dashboard
router.get('/', async (req, res) => {
  try {
    const [stats, campaigns, leads] = await Promise.all([
      all('SELECT status, COUNT(*) count FROM leads GROUP BY status ORDER BY count DESC'),
      all('SELECT * FROM campaigns ORDER BY created_at DESC'),
      all('SELECT * FROM leads ORDER BY created_at DESC LIMIT 200'),
    ]);

    res.render('dashboard', {
      stats,
      campaigns,
      leads,
      flash: {
        upload:     req.query.upload,
        queued:     req.query.queued,
        duplicates: req.query.duplicates,
        invalid:    req.query.invalid,
        requeue:    req.query.requeue,
        qc_result:  req.query.qc_result,
        qc_url:     req.query.qc_url     ? decodeURIComponent(req.query.qc_url)     : '',
        qc_error:   req.query.qc_error   ? decodeURIComponent(req.query.qc_error)   : '',
      },
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).send('Dashboard error: ' + err.message);
  }
});

// Risk events log
router.get('/risk-events', async (req, res) => {
  try {
    const events = await all(
      'SELECT * FROM risk_events ORDER BY created_at DESC LIMIT 200'
    );
    res.render('risk-events', { events });
  } catch (err) {
    res.status(500).send('Error loading risk events: ' + err.message);
  }
});

// Export all leads to Excel
router.get('/export', async (req, res) => {
  try {
    // Lazy import — only load XLSX when this route is actually called
    const XLSX = require('xlsx');
    const leads = await all('SELECT * FROM leads ORDER BY id');
    const ws    = XLSX.utils.json_to_sheet(leads);
    const wb    = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="linkedin_outreach_report.xlsx"');
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    res.status(500).send('Export error: ' + err.message);
  }
});

module.exports = router;
