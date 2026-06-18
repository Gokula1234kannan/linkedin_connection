const XLSX = require('xlsx');
const rows = [
  { first_name:'Sarah', last_name:'Lee', company:'ABC Corp', job_title:'HR Manager', linkedin_url:'https://www.linkedin.com/in/example-profile', email:'sarah@example.com', location:'Dubai', notes:'HR leader' },
  { first_name:'John', last_name:'Mathew', company:'XYZ Ltd', job_title:'CTO', linkedin_url:'', email:'john@example.com', location:'London', notes:'SaaS CTO' }
];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Leads');
XLSX.writeFile(wb, 'sample_leads.xlsx');
console.log('Created sample_leads.xlsx');
