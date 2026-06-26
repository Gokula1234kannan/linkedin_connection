/**
 * lead.service.js
 *
 * Validates lead data and creates a deduplication key.
 */

function validateLead(lead) {
  const errors = [];

  if (!lead.first_name || !lead.first_name.trim()) errors.push('Missing first_name');
  if (!lead.last_name  || !lead.last_name.trim())  errors.push('Missing last_name');
  if (!lead.company    || !lead.company.trim())    errors.push('Missing company');

  if (lead.linkedin_url) {
    const url = lead.linkedin_url.toLowerCase();
    if (!url.includes('linkedin.com/in/')) {
      errors.push('Invalid LinkedIn URL — must contain linkedin.com/in/');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Creates a normalised key for duplicate detection across multiple uploads.
 * Key: lowercase first_name|last_name|company
 */
function createLeadKey(lead) {
  return [lead.first_name, lead.last_name, lead.company]
    .map((x) => (x || '').toLowerCase().trim())
    .join('|');
}

module.exports = { validateLead, createLeadKey };
