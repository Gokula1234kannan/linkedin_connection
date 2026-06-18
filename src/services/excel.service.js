const XLSX = require('xlsx');
function clean(v){ return v == null ? '' : String(v).trim(); }
function normalizeLinkedInUrl(url){ if(!url) return ''; let u=String(url).trim().split('?')[0].replace('http://','https://'); if(u.includes('linkedin.com/in/') && !u.startsWith('https://')) u='https://'+u; return u.replace(/\/$/,''); }
function pick(row, names){ for(const n of names) if(row[n] != null) return row[n]; return ''; }
function parseExcel(filePath){ const wb=XLSX.readFile(filePath); const ws=wb.Sheets[wb.SheetNames[0]]; return XLSX.utils.sheet_to_json(ws).map(row=>({ first_name: clean(pick(row,['first_name','First Name','firstname','FirstName'])), last_name: clean(pick(row,['last_name','Last Name','lastname','LastName'])), company: clean(pick(row,['company','Company'])), job_title: clean(pick(row,['job_title','Job Title','title','Title'])), linkedin_url: normalizeLinkedInUrl(pick(row,['linkedin_url','LinkedIn URL','LinkedIn','linkedin'])), email: clean(pick(row,['email','Email'])), location: clean(pick(row,['location','Location'])), notes: clean(pick(row,['notes','Notes'])) })); }
module.exports={ parseExcel, normalizeLinkedInUrl };
