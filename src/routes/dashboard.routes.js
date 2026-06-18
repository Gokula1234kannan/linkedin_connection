const express = require('express');
const XLSX = require('xlsx');
const { all } = require('../db/database');
const router = express.Router();
router.get('/', async (req,res)=>{ const stats=await all('SELECT status, COUNT(*) count FROM leads GROUP BY status'); const campaigns=await all('SELECT * FROM campaigns ORDER BY created_at DESC'); const leads=await all('SELECT * FROM leads ORDER BY created_at DESC LIMIT 200'); res.render('dashboard',{stats,campaigns,leads}); });
router.get('/risk-events', async (req,res)=>{ const events=await all('SELECT * FROM risk_events ORDER BY created_at DESC LIMIT 200'); res.render('risk-events',{events}); });
router.get('/export', async (req,res)=>{ const leads=await all('SELECT * FROM leads ORDER BY id'); const ws=XLSX.utils.json_to_sheet(leads); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Leads'); const buf=XLSX.write(wb,{type:'buffer',bookType:'xlsx'}); res.setHeader('Content-Disposition','attachment; filename="linkedin_outreach_report.xlsx"'); res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.send(buf); });
module.exports = router;
