const path = require('path');
const { createClient } = require('@libsql/client');

// TURSO_DATABASE_URL/TURSO_AUTH_TOKEN 未設定時はローカルファイルにフォールバック（開発用）
const client = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, 'data.sqlite3')}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const SCHEMA = `
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

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    name TEXT,
    createdAt TEXT NOT NULL
  );
`;

const ready = client.executeMultiple(SCHEMA);

function makeRepo(table, columns) {
  const repo = {
    columns,

    async list() {
      const rs = await client.execute(`SELECT * FROM ${table} ORDER BY id DESC`);
      return rs.rows.map((row) => ({ ...row }));
    },

    async get(id) {
      const rs = await client.execute({ sql: `SELECT * FROM ${table} WHERE id = ?`, args: [id] });
      return rs.rows.length ? { ...rs.rows[0] } : undefined;
    },

    async insert(record) {
      const placeholders = columns.map(() => '?').join(', ');
      const args = columns.map((c) => record[c] ?? null);
      const rs = await client.execute({
        sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
        args,
      });
      return repo.get(Number(rs.lastInsertRowid));
    },

    async update(id, record) {
      const setClause = columns.map((c) => `${c} = ?`).join(', ');
      const args = [...columns.map((c) => record[c] ?? null), id];
      const rs = await client.execute({ sql: `UPDATE ${table} SET ${setClause} WHERE id = ?`, args });
      return rs.rowsAffected > 0 ? repo.get(id) : null;
    },

    async remove(id) {
      const rs = await client.execute({ sql: `DELETE FROM ${table} WHERE id = ?`, args: [id] });
      return rs.rowsAffected > 0;
    },
  };
  return repo;
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

const users = makeRepo('users', ['username', 'passwordHash', 'name', 'createdAt']);

users.findByUsername = async (username) => {
  const rs = await client.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [username] });
  return rs.rows.length ? { ...rs.rows[0] } : undefined;
};

users.count = async () => {
  const rs = await client.execute('SELECT COUNT(*) as c FROM users');
  return Number(rs.rows[0].c);
};

module.exports = {
  client,
  ready,
  sendingOrgs,
  hostCompanies,
  candidates,
  workers,
  applicationCases,
  visitsAudits,
  users,
};
