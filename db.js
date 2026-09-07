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
    industry TEXT,
    address TEXT,
    contactPerson TEXT,
    phone TEXT,
    email TEXT,
    acceptanceStartDate TEXT,
    representativeName TEXT,
    regularEmployeeCount INTEGER,
    trainingManagerName TEXT,
    skillInstructor TEXT,
    lifeInstructor TEXT,
    dormitoryAddress TEXT,
    dormitoryMonthlyFee INTEGER,
    dormitoryRoomSizeOk TEXT,
    dormitoryHasLock TEXT,
    dormitoryHasValuablesStorage TEXT,
    dormitoryInfo TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'lead',
    leadStage TEXT
  );

  CREATE TABLE IF NOT EXISTS company_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostCompanyId INTEGER NOT NULL REFERENCES host_companies(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    registrationNumber TEXT,
    issueDate TEXT,
    expiryDate TEXT,
    notes TEXT
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
    passportExpiryDate TEXT,
    residenceCardNumber TEXT,
    visaType TEXT NOT NULL,
    visaExpiryDate TEXT NOT NULL,
    entryDate TEXT,
    trainingStartDate TEXT,
    hostCompanyId INTEGER REFERENCES host_companies(id) ON DELETE SET NULL,
    sendingOrgId INTEGER REFERENCES sending_organizations(id) ON DELETE SET NULL,
    jobCategory TEXT,
    contractStartDate TEXT,
    contractEndDate TEXT,
    phone TEXT,
    homeCountryAddress TEXT,
    notes TEXT,
    statusType TEXT NOT NULL DEFAULT '技能実習',
    currentStage TEXT,
    baseSalary INTEGER,
    workingHours TEXT,
    workStartTime TEXT,
    workEndTime TEXT,
    holidays TEXT,
    payDate TEXT,
    overtimeRate TEXT,
    allowances TEXT,
    deductions TEXT,
    educationWorkHistory TEXT,
    dormitoryInfo TEXT,
    healthCheckDate TEXT,
    specialHealthChecks TEXT,
    consultationContact TEXT,
    insuranceStatus TEXT,
    tokuteiTrainingStatus TEXT,
    tokuteiTrainingDate TEXT
  );

  CREATE TABLE IF NOT EXISTS worker_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workerId INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    registrationNumber TEXT,
    issueDate TEXT,
    expiryDate TEXT,
    notes TEXT
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

  CREATE TABLE IF NOT EXISTS billing_rates (
    visaType TEXT PRIMARY KEY,
    monthlyFee INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostCompanyId INTEGER NOT NULL REFERENCES host_companies(id) ON DELETE CASCADE,
    billingMonth TEXT NOT NULL,
    issueDate TEXT,
    dueDate TEXT,
    status TEXT NOT NULL DEFAULT '下書き',
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoiceId INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    workerId INTEGER REFERENCES workers(id) ON DELETE SET NULL,
    itemType TEXT NOT NULL DEFAULT 'additional',
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unitPrice INTEGER NOT NULL DEFAULT 0,
    amount INTEGER NOT NULL DEFAULT 0
  );
`;

// 既存の本番データベース（Turso）にはこれらの列が無い可能性があるため、
// CREATE TABLE IF NOT EXISTS では追加されない列を ALTER TABLE で補完する。
// NOT NULL 制約のある元からの列（name, visaType 等）は必ず存在するため対象外。
const MIGRATION_COLUMNS = {
  host_companies: [
    ['industry', 'TEXT'], ['address', 'TEXT'], ['contactPerson', 'TEXT'], ['phone', 'TEXT'],
    ['email', 'TEXT'], ['acceptanceStartDate', 'TEXT'], ['representativeName', 'TEXT'],
    ['regularEmployeeCount', 'INTEGER'], ['trainingManagerName', 'TEXT'], ['skillInstructor', 'TEXT'],
    ['lifeInstructor', 'TEXT'], ['dormitoryAddress', 'TEXT'], ['dormitoryMonthlyFee', 'INTEGER'],
    ['dormitoryRoomSizeOk', 'TEXT'], ['dormitoryHasLock', 'TEXT'], ['dormitoryHasValuablesStorage', 'TEXT'],
    ['dormitoryInfo', 'TEXT'], ['notes', 'TEXT'], ['leadStage', 'TEXT'],
  ],
  workers: [
    ['nameKana', 'TEXT'], ['nationality', 'TEXT'], ['gender', 'TEXT'], ['dob', 'TEXT'],
    ['passportNumber', 'TEXT'], ['passportExpiryDate', 'TEXT'], ['residenceCardNumber', 'TEXT'],
    ['entryDate', 'TEXT'], ['trainingStartDate', 'TEXT'], ['hostCompanyId', 'INTEGER'],
    ['sendingOrgId', 'INTEGER'], ['jobCategory', 'TEXT'], ['contractStartDate', 'TEXT'],
    ['contractEndDate', 'TEXT'], ['phone', 'TEXT'], ['homeCountryAddress', 'TEXT'], ['notes', 'TEXT'],
    ['currentStage', 'TEXT'], ['baseSalary', 'INTEGER'], ['workingHours', 'TEXT'],
    ['workStartTime', 'TEXT'], ['workEndTime', 'TEXT'], ['holidays', 'TEXT'], ['payDate', 'TEXT'],
    ['overtimeRate', 'TEXT'], ['allowances', 'TEXT'], ['deductions', 'TEXT'],
    ['educationWorkHistory', 'TEXT'], ['dormitoryInfo', 'TEXT'], ['healthCheckDate', 'TEXT'],
    ['specialHealthChecks', 'TEXT'], ['consultationContact', 'TEXT'], ['insuranceStatus', 'TEXT'],
    ['tokuteiTrainingStatus', 'TEXT'], ['tokuteiTrainingDate', 'TEXT'],
  ],
};

async function migrateSchema() {
  for (const [table, cols] of Object.entries(MIGRATION_COLUMNS)) {
    const info = await client.execute(`PRAGMA table_info(${table})`);
    const existing = new Set(info.rows.map((row) => row.name));
    for (const [name, type] of cols) {
      if (!existing.has(name)) {
        await client.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
      }
    }
  }
}

const ready = client.executeMultiple(SCHEMA).then(() => migrateSchema());

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
  'name', 'industry', 'address', 'contactPerson', 'phone', 'email', 'acceptanceStartDate',
  'representativeName', 'regularEmployeeCount', 'trainingManagerName', 'skillInstructor', 'lifeInstructor',
  'dormitoryAddress', 'dormitoryMonthlyFee', 'dormitoryRoomSizeOk', 'dormitoryHasLock',
  'dormitoryHasValuablesStorage', 'dormitoryInfo', 'notes', 'status', 'leadStage',
]);

const companyRegistrations = makeRepo('company_registrations', [
  'hostCompanyId', 'label', 'registrationNumber', 'issueDate', 'expiryDate', 'notes',
]);

companyRegistrations.listByCompany = async (hostCompanyId) => {
  const rs = await client.execute({
    sql: 'SELECT * FROM company_registrations WHERE hostCompanyId = ? ORDER BY id',
    args: [hostCompanyId],
  });
  return rs.rows.map((row) => ({ ...row }));
};

const candidates = makeRepo('candidates', [
  'name', 'nationality', 'sendingOrgId', 'interviewDate', 'stage', 'notes',
]);

const workers = makeRepo('workers', [
  'name', 'nameKana', 'nationality', 'gender', 'dob', 'passportNumber', 'passportExpiryDate',
  'residenceCardNumber', 'visaType', 'visaExpiryDate', 'entryDate', 'trainingStartDate',
  'hostCompanyId', 'sendingOrgId', 'jobCategory', 'contractStartDate', 'contractEndDate', 'phone',
  'homeCountryAddress', 'notes', 'statusType', 'currentStage', 'baseSalary', 'workingHours',
  'workStartTime', 'workEndTime', 'holidays', 'payDate', 'overtimeRate', 'allowances', 'deductions',
  'educationWorkHistory', 'dormitoryInfo', 'healthCheckDate', 'specialHealthChecks',
  'consultationContact', 'insuranceStatus', 'tokuteiTrainingStatus', 'tokuteiTrainingDate',
]);

const workerRegistrations = makeRepo('worker_registrations', [
  'workerId', 'label', 'registrationNumber', 'issueDate', 'expiryDate', 'notes',
]);

workerRegistrations.listByWorker = async (workerId) => {
  const rs = await client.execute({
    sql: 'SELECT * FROM worker_registrations WHERE workerId = ? ORDER BY id',
    args: [workerId],
  });
  return rs.rows.map((row) => ({ ...row }));
};

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

const invoices = makeRepo('invoices', [
  'hostCompanyId', 'billingMonth', 'issueDate', 'dueDate', 'status', 'notes',
]);

const invoiceItems = makeRepo('invoice_items', [
  'invoiceId', 'workerId', 'itemType', 'description', 'quantity', 'unitPrice', 'amount',
]);

invoiceItems.listByInvoice = async (invoiceId) => {
  const rs = await client.execute({
    sql: 'SELECT * FROM invoice_items WHERE invoiceId = ? ORDER BY id',
    args: [invoiceId],
  });
  return rs.rows.map((row) => ({ ...row }));
};

const billingRates = {
  async list() {
    const rs = await client.execute('SELECT * FROM billing_rates');
    return rs.rows.map((row) => ({ ...row }));
  },
  async upsert(visaType, monthlyFee) {
    await client.execute({
      sql: `INSERT INTO billing_rates (visaType, monthlyFee) VALUES (?, ?)
            ON CONFLICT(visaType) DO UPDATE SET monthlyFee = excluded.monthlyFee`,
      args: [visaType, monthlyFee],
    });
    const rs = await client.execute({ sql: 'SELECT * FROM billing_rates WHERE visaType = ?', args: [visaType] });
    return { ...rs.rows[0] };
  },
};

module.exports = {
  client,
  ready,
  sendingOrgs,
  hostCompanies,
  companyRegistrations,
  candidates,
  workers,
  workerRegistrations,
  applicationCases,
  visitsAudits,
  users,
  invoices,
  invoiceItems,
  billingRates,
};
