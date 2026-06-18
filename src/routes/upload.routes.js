const express = require('express');
const multer = require('multer');
const { run } = require('../db/database');
const { parseExcel } = require('../services/excel.service');
const { validateLead, createLeadKey } = require('../services/lead.service');
const { generateConnectionMessage } = require('../services/message.service');
const router = express.Router();
const upload = multer({ dest: process.env.UPLOAD_DIR || 'uploads/' });
router.post('/', upload.single('file'), async (req,res)=>{
  try {
    if(!req.file) return res.status(400).send('No file uploaded');
    const campaign = await run('INSERT INTO campaigns (name,daily_limit,hourly_limit) VALUES (?,?,?)',[req.body.name || `Campaign ${Date.now()}`, +(process.env.DAILY_LIMIT||20), +(process.env.HOURLY_LIMIT||4)]);
    const campaignId = campaign.lastID;
    const rows = parseExcel(req.file.path);
    const seen = new Set();
    for(const lead of rows){
      const validation = validateLead(lead); const key = createLeadKey(lead);
      let status='VALIDATED', errorReason='';
      if(!validation.valid){ status='INVALID'; errorReason=validation.errors.join(', '); }
      else if(seen.has(key)){ status='DUPLICATE'; errorReason='Duplicate in uploaded file'; }
      seen.add(key);
      let message='';
      if(status==='VALIDATED'){ message = await generateConnectionMessage(lead); status='MESSAGE_READY'; }
      const inserted = await run(`INSERT INTO leads (campaign_id, first_name, last_name, company, job_title, linkedin_url, email, location, notes, message, status, error_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [campaignId, lead.first_name, lead.last_name, lead.company, lead.job_title, lead.linkedin_url, lead.email, lead.location, lead.notes, message, status, errorReason]);
      if(status==='MESSAGE_READY' && lead.linkedin_url){ await run("INSERT INTO outreach_jobs (lead_id,campaign_id,status,scheduled_at) VALUES (?,?,'QUEUED',DATETIME('now'))", [inserted.lastID, campaignId]); }
    }
    res.redirect('/');
  } catch(e){ console.error(e); res.status(500).send(e.message); }
});
module.exports = router;
