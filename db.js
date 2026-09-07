const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite3');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS workers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    nameKana TEXT,
    nationality TEXT,
    gender TEXT,
    dob TEXT,
    passportNumber TEXT,
    residenceCardNumber TEXT,
    visaType TEXT NOT NULL,
    visaExpiryDate TEXT NOT NULL,
    entryDate TEXT,
    companyName TEXT NOT NULL,
    jobCategory TEXT,
    contractStartDate TEXT,
    contractEndDate TEXT,
    phone TEXT,
    notes TEXT
  )
`);

const WORKER_COLUMNS = [
  'name', 'nameKana', 'nationality', 'gender', 'dob', 'passportNumber',
  'residenceCardNumber', 'visaType', 'visaExpiryDate', 'entryDate',
  'companyName', 'jobCategory', 'contractStartDate', 'contractEndDate',
  'phone', 'notes',
];

function listWorkers() {
  return db.prepare('SELECT * FROM workers ORDER BY id').all();
}

function getWorker(id) {
  return db.prepare('SELECT * FROM workers WHERE id = ?').get(id);
}

function insertWorker(record) {
  const cols = WORKER_COLUMNS;
  const placeholders = cols.map((c) => `@${c}`).join(', ');
  const stmt = db.prepare(
    `INSERT INTO workers (${cols.join(', ')}) VALUES (${placeholders})`
  );
  const info = stmt.run(record);
  return getWorker(info.lastInsertRowid);
}

function updateWorker(id, record) {
  const cols = WORKER_COLUMNS;
  const setClause = cols.map((c) => `${c} = @${c}`).join(', ');
  const stmt = db.prepare(`UPDATE workers SET ${setClause} WHERE id = @id`);
  const info = stmt.run({ ...record, id });
  return info.changes > 0 ? getWorker(id) : null;
}

function deleteWorker(id) {
  const info = db.prepare('DELETE FROM workers WHERE id = ?').run(id);
  return info.changes > 0;
}

module.exports = {
  WORKER_COLUMNS,
  listWorkers,
  getWorker,
  insertWorker,
  updateWorker,
  deleteWorker,
};
