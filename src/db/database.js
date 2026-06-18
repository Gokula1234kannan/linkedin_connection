const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const dbPath = process.env.DATABASE_PATH || './data.sqlite';
const db = new sqlite3.Database(dbPath);
function initDb() { const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'); db.exec(schema, (err) => { if (err) { console.error('DB schema error:', err); process.exit(1); } }); }
function run(sql, params=[]) { return new Promise((resolve,reject)=>db.run(sql, params, function(err){ err ? reject(err) : resolve(this); })); }
function get(sql, params=[]) { return new Promise((resolve,reject)=>db.get(sql, params, (err,row)=> err ? reject(err) : resolve(row))); }
function all(sql, params=[]) { return new Promise((resolve,reject)=>db.all(sql, params, (err,rows)=> err ? reject(err) : resolve(rows))); }
module.exports = { db, initDb, run, get, all };
