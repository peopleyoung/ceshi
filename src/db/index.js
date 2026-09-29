const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(config.dbPath)) {
    const buffer = fs.readFileSync(config.dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');
  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(config.dbPath, buffer);
}

async function initSchema() {
  const database = await getDb();

  database.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      file_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS review_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tender_file_id TEXT NOT NULL,
      bid_file_id TEXT NOT NULL,
      bid_deadline TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      current_step TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (tender_file_id) REFERENCES files(id),
      FOREIGN KEY (bid_file_id) REFERENCES files(id)
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS review_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      conclusion TEXT NOT NULL,
      excerpt TEXT,
      basis TEXT,
      confidence REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES review_tasks(id) ON DELETE CASCADE
    )
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS ai_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      endpoint TEXT NOT NULL,
      model_name TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  database.run('CREATE INDEX IF NOT EXISTS idx_review_tasks_user_id ON review_tasks(user_id)');
  database.run('CREATE INDEX IF NOT EXISTS idx_review_tasks_status ON review_tasks(status)');
  database.run('CREATE INDEX IF NOT EXISTS idx_review_results_task_id ON review_results(task_id)');
  database.run('CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id)');

  const result = database.exec('SELECT id FROM ai_config WHERE id = 1');
  if (result.length === 0 || result[0].values.length === 0) {
    database.run(
      'INSERT INTO ai_config (id, endpoint, model_name, api_key) VALUES (1, ?, ?, ?)',
      [config.defaultAiConfig.endpoint, config.defaultAiConfig.modelName, config.defaultAiConfig.apiKey]
    );
  }

  saveDb();
}

function queryAll(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

function run(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  const lastId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  const changes = db.getRowsModified();
  saveDb();
  return { lastInsertRowid: lastId, changes };
}

module.exports = {
  getDb,
  initSchema,
  queryAll,
  queryOne,
  run,
  saveDb,
};
