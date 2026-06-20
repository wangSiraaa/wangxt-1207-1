const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'waste.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function columnExists(tableName, colName) {
  const row = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return row.some((r) => r.name === colName);
}

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      compat_class TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cabinets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      location TEXT
    );

    CREATE TABLE IF NOT EXISTS declarations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barrel_code TEXT UNIQUE NOT NULL,
      category_id INTEGER NOT NULL,
      lab_name TEXT NOT NULL,
      submitter TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      cabinet_id INTEGER,
      declare_weight REAL,
      weight REAL,
      transfer_unit TEXT,
      transfer_operator TEXT,
      transfer_vehicle TEXT,
      transferred_at TEXT,
      weighed_at TEXT,
      locked INTEGER NOT NULL DEFAULT 0,
      remark TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (cabinet_id) REFERENCES cabinets(id)
    );

    CREATE TABLE IF NOT EXISTS transfer_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      declaration_id INTEGER NOT NULL,
      barrel_code TEXT NOT NULL,
      category_name TEXT,
      transfer_unit TEXT,
      operator TEXT,
      vehicle TEXT,
      weight REAL,
      transferred_at TEXT,
      weighed_at TEXT,
      FOREIGN KEY (declaration_id) REFERENCES declarations(id)
    );

    CREATE TABLE IF NOT EXISTS review_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      declaration_id INTEGER NOT NULL,
      barrel_code TEXT NOT NULL,
      declare_weight REAL NOT NULL,
      actual_weight REAL NOT NULL,
      diff_percent REAL NOT NULL,
      diff_weight REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      review_note TEXT,
      reviewer TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (declaration_id) REFERENCES declarations(id)
    );
  `);

  if (!columnExists('declarations', 'hazard_props')) {
    db.exec('ALTER TABLE declarations ADD COLUMN hazard_props TEXT');
  }
  if (!columnExists('declarations', 'declare_weight')) {
    db.exec('ALTER TABLE declarations ADD COLUMN declare_weight REAL');
  }
  if (!columnExists('transfer_records', 'declare_weight')) {
    db.exec('ALTER TABLE transfer_records ADD COLUMN declare_weight REAL');
  }
  if (!columnExists('transfer_records', 'diff_percent')) {
    db.exec('ALTER TABLE transfer_records ADD COLUMN diff_percent REAL');
  }
  if (!columnExists('review_orders', 'hazard_props')) {
    db.exec('ALTER TABLE review_orders ADD COLUMN hazard_props TEXT');
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_decl_status ON declarations(status);
    CREATE INDEX IF NOT EXISTS idx_decl_cabinet ON declarations(cabinet_id);
    CREATE INDEX IF NOT EXISTS idx_tr_decl ON transfer_records(declaration_id);
    CREATE INDEX IF NOT EXISTS idx_ro_decl ON review_orders(declaration_id);
    CREATE INDEX IF NOT EXISTS idx_ro_status ON review_orders(status);
  `);

  const catCount = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
  if (catCount === 0) {
    const ins = db.prepare('INSERT INTO categories(code, name, compat_class) VALUES(?, ?, ?)');
    const cats = [
      ['acid', '酸性废液', 'acid'],
      ['base', '碱性废液', 'base'],
      ['organic', '有机废液', 'organic'],
      ['inorganic', '无机废液', 'inorganic'],
      ['metal', '重金属废液', 'metal'],
      ['oxidizer', '氧化性废液', 'oxidizer'],
      ['reducer', '还原性废液', 'reducer'],
    ];
    for (const c of cats) ins.run(...c);
  }

  const cabCount = db.prepare('SELECT COUNT(*) AS c FROM cabinets').get().c;
  if (cabCount === 0) {
    const ins = db.prepare('INSERT INTO cabinets(name, capacity, location) VALUES(?, ?, ?)');
    ins.run('暂存柜A', 4, '化学楼1层东侧');
    ins.run('暂存柜B', 4, '化学楼1层西侧');
    ins.run('暂存柜C', 2, '化学楼2层北侧');
  }
}

init();

module.exports = db;
