const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite3');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS sending_organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    country TEXT,
    licenseNumber TEXT,
    contactPerson TEXT,
    contactPhone TEXT,
    contactEmail TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS host_companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    contactPerson TEXT,
    skillInstructor TEXT,
    lifeInstructor TEXT,
    dormitoryInfo TEXT,
    phone TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'lead',
    leadStage TEXT
  );

  CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    nationality TEXT,
    sendingOrgId INTEGER REFERENCES sending_organizations(id) ON DELETE SET NULL,
    interviewDate TEXT,
    stage TEXT NOT NULL DEFAULT 'エントリー',
    notes TEXT
  );

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
    hostCompanyId INTEGER REFERENCES host_companies(id) ON DELETE SET NULL,
    sendingOrgId INTEGER REFERENCES sending_organizations(id) ON DELETE SET NULL,
    jobCategory TEXT,
    contractStartDate TEXT,
    contractEndDate TEXT,
    phone TEXT,
    notes TEXT,
    statusType TEXT NOT NULL DEFAULT '技能実習',
    currentStage TEXT,
    baseSalary INTEGER,
    workingHours TEXT,
    overtimeRate TEXT,
    allowances TEXT,
    deductions TEXT,
    dormitoryInfo TEXT,
    healthCheckDate TEXT,
    consultationContact TEXT,
    insuranceStatus TEXT
  );

  CREATE TABLE IF NOT EXISTS application_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workerId INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    statusType TEXT NOT NULL,
    stage TEXT,
    status TEXT NOT NULL DEFAULT '書類準備中',
    dueDate TEXT,
    submittedDate TEXT,
    approvedDate TEXT,
    notes TEXT,
    checklist TEXT
  );

  CREATE TABLE IF NOT EXISTS visits_audits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workerId INTEGER REFERENCES workers(id) ON DELETE SET NULL,
    hostCompanyId INTEGER REFERENCES host_companies(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    scheduledDate TEXT NOT NULL,
    completedDate TEXT,
    result TEXT,
    notes TEXT
  );
`);

function makeRepo(table, columns) {
  const cols = columns;
  const selectAll = db.prepare(`SELECT * FROM ${table} ORDER BY id DESC`);
  const selectOne = db.prepare(`SELECT * FROM ${table} WHERE id = ?`);
  const insertStmt = db.prepare(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`
  );
  const updateStmt = db.prepare(
    `UPDATE ${table} SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`
  );
  const deleteStmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`);

  return {
    columns: cols,
    list() {
      return selectAll.all();
    },
    get(id) {
      return selectOne.get(id);
    },
    insert(record) {
      const info = insertStmt.run(record);
      return selectOne.get(info.lastInsertRowid);
    },
    update(id, record) {
      const info = updateStmt.run({ ...record, id });
      return info.changes > 0 ? selectOne.get(id) : null;
    },
    remove(id) {
      return deleteStmt.run(id).changes > 0;
    },
  };
}

const sendingOrgs = makeRepo('sending_organizations', [
  'name', 'country', 'licenseNumber', 'contactPerson', 'contactPhone', 'contactEmail', 'notes',
]);

const hostCompanies = makeRepo('host_companies', [
  'name', 'address', 'contactPerson', 'skillInstructor', 'lifeInstructor',
  'dormitoryInfo', 'phone', 'notes', 'status', 'leadStage',
]);

const candidates = makeRepo('candidates', [
  'name', 'nationality', 'sendingOrgId', 'interviewDate', 'stage', 'notes',
]);

const workers = makeRepo('workers', [
  'name', 'nameKana', 'nationality', 'gender', 'dob', 'passportNumber', 'residenceCardNumber',
  'visaType', 'visaExpiryDate', 'entryDate', 'hostCompanyId', 'sendingOrgId', 'jobCategory',
  'contractStartDate', 'contractEndDate', 'phone', 'notes', 'statusType', 'currentStage',
  'baseSalary', 'workingHours', 'overtimeRate', 'allowances', 'deductions', 'dormitoryInfo',
  'healthCheckDate', 'consultationContact', 'insuranceStatus',
]);

const applicationCases = makeRepo('application_cases', [
  'workerId', 'statusType', 'stage', 'status', 'dueDate', 'submittedDate', 'approvedDate', 'notes', 'checklist',
]);

const visitsAudits = makeRepo('visits_audits', [
  'workerId', 'hostCompanyId', 'type', 'scheduledDate', 'completedDate', 'result', 'notes',
]);

module.exports = {
  db,
  sendingOrgs,
  hostCompanies,
  candidates,
  workers,
  applicationCases,
  visitsAudits,
};
