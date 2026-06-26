/**
 * upload.routes.js
 *
 * Handles Excel file upload, lead parsing, validation, deduplication,
 * message generation, and job queuing.
 *
 * Fixed:
 *  - Server-side file type validation (not just HTML accept attribute)
 *  - Temp file deleted after parsing (no disk leak)
 *  - Cross-upload duplicate detection via DB query (not just in-memory Set)
 *  - Proper error handling and feedback
 */

const express   = require('express');
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const { run, get } = require('../db/database');
const { parseExcel }              = require('../services/excel.service');
const { validateLead, createLeadKey } = require('../services/lead.service');
const { generateConnectionMessage }   = require('../services/message.service');

const router = express.Router();

// Multer: save temp files to uploads/ directory
const upload = multer({
  dest: process.env.UPLOAD_DIR || 'uploads/',
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (req, file, cb) => {
    // Server-side file type validation — fixes security issue
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel',                                           // .xls
      'text/csv',
      'application/csv',
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = ['.xlsx', '.xls', '.csv'];

    if (allowed.includes(file.mimetype) || allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed'));
    }
  },
});

/**
 * POST /upload
 * Processes an uploaded Excel file and creates a campaign with queued jobs.
 */
router.post('/', upload.single('file'), async (req, res) => {
  const tempPath = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded. Please select an Excel or CSV file.');
    }

    // Create campaign
    const campaign = await run(
      'INSERT INTO campaigns (name, daily_limit, hourly_limit) VALUES (?, ?, ?)',
      [
        (req.body.name || '').trim() || `Campaign ${new Date().toLocaleDateString('en-IN')}`,
        +(process.env.DAILY_LIMIT  || 20),
        +(process.env.HOURLY_LIMIT || 4),
      ]
    );
    const campaignId = campaign.lastID;

    // Parse Excel / CSV
    const rows = parseExcel(req.file.path);

    if (rows.length === 0) {
      return res.status(400).send('The uploaded file has no rows. Check column headers match the required format.');
    }

    const seenInThisUpload = new Set(); // In-upload dedup
    let queued = 0, duplicates = 0, invalid = 0;

    for (const lead of rows) {
      const validation = validateLead(lead);
      const key = createLeadKey(lead);

      let status = 'VALIDATED';
      let errorReason = '';

      if (!validation.valid) {
        status = 'INVALID';
        errorReason = validation.errors.join(', ');
        invalid++;
      } else if (seenInThisUpload.has(key)) {
        status = 'DUPLICATE';
        errorReason = 'Duplicate in uploaded file';
        duplicates++;
      } else {
        // Cross-upload duplicate check — query the DB
        if (lead.linkedin_url) {
          const existingByUrl = await get(
            'SELECT id FROM leads WHERE linkedin_url = ?',
            [lead.linkedin_url]
          );
          if (existingByUrl) {
            status = 'DUPLICATE';
            errorReason = 'LinkedIn URL already exists in database';
            duplicates++;
          }
        }

        if (status === 'VALIDATED') {
          // Also check by name+company
          const existingByKey = await get(
            `SELECT id FROM leads
             WHERE LOWER(first_name)=? AND LOWER(last_name)=? AND LOWER(company)=?`,
            [
              (lead.first_name || '').toLowerCase().trim(),
              (lead.last_name  || '').toLowerCase().trim(),
              (lead.company    || '').toLowerCase().trim(),
            ]
          );
          if (existingByKey) {
            status = 'DUPLICATE';
            errorReason = 'Lead with same name and company already in database';
            duplicates++;
          }
        }
      }

      seenInThisUpload.add(key);

      // Generate connection message for valid leads
      let message = '';
      if (status === 'VALIDATED') {
        message = await generateConnectionMessage(lead);
        status = 'MESSAGE_READY';
      }

      // Insert lead
      const inserted = await run(
        `INSERT INTO leads
          (campaign_id, first_name, last_name, company, job_title,
           linkedin_url, email, location, notes, message, status, error_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          campaignId,
          lead.first_name,
          lead.last_name,
          lead.company,
          lead.job_title,
          lead.linkedin_url,
          lead.email,
          lead.location,
          lead.notes,
          message,
          status,
          errorReason,
        ]
      );

      // Queue job for valid leads with a LinkedIn URL
      if (status === 'MESSAGE_READY' && lead.linkedin_url) {
        await run(
          `INSERT INTO outreach_jobs (lead_id, campaign_id, status, scheduled_at)
           VALUES (?, ?, 'QUEUED', DATETIME('now'))`,
          [inserted.lastID, campaignId]
        );
        queued++;
      }
    }

    console.log(`✅ Upload complete: ${queued} queued, ${duplicates} duplicates, ${invalid} invalid`);
    res.redirect(`/?upload=success&queued=${queued}&duplicates=${duplicates}&invalid=${invalid}`);

  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).send(`Upload failed: ${err.message}`);
  } finally {
    // Always delete the temp file — fixes disk leak bug
    if (tempPath) {
      fs.unlink(tempPath, () => {});
    }
  }
});

module.exports = router;
