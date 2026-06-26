/**
 * excel.service.js
 *
 * Parses Excel (.xlsx / .xls) and CSV files into normalised lead objects.
 * Handles flexible column names (e.g. "First Name", "first_name", "firstname").
 */

const XLSX = require('xlsx');

function clean(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * Normalises a LinkedIn URL to the canonical https://www.linkedin.com/in/slug form.
 * Strips query parameters and trailing slashes.
 */
function normalizeLinkedInUrl(url) {
  if (!url) return '';
  let u = String(url).trim().split('?')[0];          // Remove query params
  u = u.replace(/\/+$/, '');                          // Remove trailing slash
  u = u.replace(/^http:\/\//, 'https://');            // Force HTTPS
  if (u.includes('linkedin.com/in/') && !u.startsWith('https://')) {
    u = 'https://' + u;
  }
  return u;
}

/**
 * Returns the value of the first column name that exists in the row.
 */
function pick(row, candidates) {
  for (const name of candidates) {
    if (row[name] != null && String(row[name]).trim() !== '') return row[name];
  }
  return '';
}

/**
 * Reads the first sheet of an Excel or CSV file and returns an array of lead objects.
 */
function parseExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  return rows.map((row) => ({
    first_name:   clean(pick(row, ['first_name', 'First Name', 'firstname', 'FirstName', 'First'])),
    last_name:    clean(pick(row, ['last_name',  'Last Name',  'lastname',  'LastName',  'Last'])),
    company:      clean(pick(row, ['company',    'Company',    'Organization'])),
    job_title:    clean(pick(row, ['job_title',  'Job Title',  'title', 'Title', 'Position'])),
    linkedin_url: normalizeLinkedInUrl(pick(row, ['linkedin_url', 'LinkedIn URL', 'LinkedIn', 'linkedin', 'Profile URL'])),
    email:        clean(pick(row, ['email', 'Email', 'Email Address'])),
    location:     clean(pick(row, ['location', 'Location', 'City'])),
    notes:        clean(pick(row, ['notes', 'Notes', 'Comments'])),
  }));
}

module.exports = { parseExcel, normalizeLinkedInUrl };
