const express = require('express');
const { run } = require('../db/database');
const router = express.Router();
router.post('/pause/:id', async (req,res)=>{ await run("UPDATE campaigns SET status='PAUSED' WHERE id=?",[req.params.id]); res.redirect('/'); });
router.post('/resume/:id', async (req,res)=>{ await run("UPDATE campaigns SET status='ACTIVE' WHERE id=?",[req.params.id]); res.redirect('/'); });
router.post('/requeue/:leadId', async (req,res)=>{ await run("UPDATE leads SET status='MESSAGE_READY', updated_at=DATETIME('now') WHERE id=?",[req.params.leadId]); await run("INSERT INTO outreach_jobs (lead_id,campaign_id,status,scheduled_at) SELECT id,campaign_id,'QUEUED',DATETIME('now') FROM leads WHERE id=?",[req.params.leadId]); res.redirect('/'); });
module.exports = router;
