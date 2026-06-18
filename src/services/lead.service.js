function validateLead(lead){ const errors=[]; if(!lead.first_name) errors.push('Missing first_name'); if(!lead.last_name) errors.push('Missing last_name'); if(!lead.company) errors.push('Missing company'); if(lead.linkedin_url && !lead.linkedin_url.includes('linkedin.com/in/')) errors.push('Invalid LinkedIn URL'); return { valid: errors.length===0, errors }; }
function createLeadKey(lead){ return [lead.first_name, lead.last_name, lead.company].map(x=>(x||'').toLowerCase().trim()).join('|'); }
module.exports={ validateLead, createLeadKey };
