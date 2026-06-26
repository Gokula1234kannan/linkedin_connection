require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || './data.sqlite';
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) { console.error('Cannot open database:', err.message); process.exit(1); }
});

// Fix: WAL mode allows concurrent reads+writes between the web server and the worker process
db.serialize(() => {
  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA busy_timeout=5000');   // Wait up to 5s instead of throwing SQLITE_BUSY
  db.run('PRAGMA foreign_keys=ON');
});

function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema, (err) => {
    if (err) {
      console.error('DB schema error:', err);
      process.exit(1);
    }
    console.log('✅ Database initialized');
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    })
  );
}

function get(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) =>
      err ? reject(err) : resolve(row)
    )
  );
}

function all(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) =>
      err ? reject(err) : resolve(rows)
    )
  );
}

module.exports = { db, initDb, run, get, all };
