require('dotenv').config();
const { initDb } = require('./database');
initDb();
setTimeout(()=>{ console.log('Database initialized'); process.exit(0); }, 300);
