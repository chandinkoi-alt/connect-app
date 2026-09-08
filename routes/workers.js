const express = require('express');
const ExcelJS = require('exceljs');
const { workers, hostCompanies, sendingOrgs, applicationCases, visitsAudits, workerRegistrations } = require('../db');
const { getDaysUntil, getUrgency } = require('../lib/dates');
const { SPECIAL_HEALTH_CHECK_TYPES, buildSpecialHealthChecks } = require('../lib/healthChecks');

const router = express.Router();

const VISA_TYPES = ['技能実習1号', '技能実習2号', '技能実習3号', '育成就労', '特定技能1号', '特定技能2号'];
const STATUS_TYPES = ['技能実習', '育成就労', '特定技能'];
const STAGE_OPTIONS = ['準備中', '就労中', '一時帰国中', '帰国済み'];
const TOKUTEI_TRAINING_STATUSES = ['未受講', '受講中', '受講済み'];

function joinWorker(worker, companyById, sendingOrgById) {
  const company = worker.hostCompanyId ? companyById.get(worker.hostCompanyId) : null;
  const sendingOrg = worker.sendingOrgId ? sendingOrgById.get(worker.sendingOrgId) : null;
  return {
    ...worker,
    companyName: company ? company.name : '',
    sendingOrgName: sendingOrg ? sendingOrg.name : '',
    visaStatus: getUrgency(getDaysUntil(worker.visaExpiryDate)),
    specialHealthChecks: JSON.parse(worker.specialHealthChecks || '[]'),
  };
}

async function withJoins(worker) {
  const company = worker.hostCompanyId ? await hostCompanies.get(worker.hostCompanyId) : null;
  const sendingOrg = worker.sendingOrgId ? await sendingOrgs.get(worker.sendingOrgId) : null;
  return joinWorker(
    worker,
    new Map(company ? [[company.id, company]] : []),
    new Map(sendingOrg ? [[sendingOrg.id, sendingOrg]] : [])
  );
}

// 一覧表示など、大量の対象者をまとめて結合するとき用。企業・送出機関を1回ずつ取得して
// Mapで引くことで、件数分だけ .get() を呼ぶ（Tursoへ通信するたびに時間がかかる）のを防ぐ。
async function withJoinsAll(workerList) {
  const [allCompanies, allSendingOrgs] = await Promise.all([hostCompanies.list(), sendingOrgs.list()]);
  const companyById = new Map(allCompanies.map((c) => [c.id, c]));
  const sendingOrgById = new Map(allSendingOrgs.map((o) => [o.id, o]));
  return workerList.map((w) => joinWorker(w, companyById, sendingOrgById));
}

function buildRecord(body, existing = {}) {
  return {
    name: (body.name || '').trim(),
    nameKana: (body.nameKana || '').trim(),
    nationality: (body.nationality || '').trim(),
    gender: body.gender || '',
    dob: body.dob || '',
    passportNumber: (body.passportNumber || '').trim(),
    passportExpiryDate: body.passportExpiryDate || '',
    residenceCardNumber: (body.residenceCardNumber || '').trim(),
    visaType: body.visaType || '',
    visaExpiryDate: body.visaExpiryDate || '',
    entryDate: body.entryDate || '',
    trainingStartDate: body.trainingStartDate || '',
    hostCompanyId: body.hostCompanyId ? Number(body.hostCompanyId) : null,
    sendingOrgId: body.sendingOrgId ? Number(body.sendingOrgId) : null,
    jobCategory: (body.jobCategory || '').trim(),
    contractStartDate: body.contractStartDate || '',
    contractEndDate: body.contractEndDate || '',
    phone: (body.phone || '').trim(),
    homeCountryAddress: (body.homeCountryAddress || '').trim(),
    notes: (body.notes || '').trim(),
    statusType: body.statusType || STATUS_TYPES[0],
    currentStage: body.currentStage || '',
    baseSalary: body.baseSalary ? Number(body.baseSalary) : null,
    workingHours: (body.workingHours || '').trim(),
    workStartTime: (body.workStartTime || '').trim(),
    workEndTime: (body.workEndTime || '').trim(),
    holidays: (body.holidays || '').trim(),
    payDate: (body.payDate || '').trim(),
    overtimeRate: (body.overtimeRate || '').trim(),
    allowances: (body.allowances || '').trim(),
    deductions: (body.deductions || '').trim(),
    educationWorkHistory: (body.educationWorkHistory || '').trim(),
    dormitoryInfo: (body.dormitoryInfo || '').trim(),
    healthCheckDate: body.healthCheckDate || '',
    specialHealthChecks: body.specialHealthChecks
      ? JSON.stringify(body.specialHealthChecks)
      : existing.specialHealthChecks || JSON.stringify(buildSpecialHealthChecks()),
    consultationContact: (body.consultationContact || '').trim(),
    insuranceStatus: (body.insuranceStatus || '').trim(),
    tokuteiTrainingStatus: body.tokuteiTrainingStatus || '',
    tokuteiTrainingDate: body.tokuteiTrainingDate || '',
  };
}

function validate(body) {
  const errors = [];
  if (!body.name || !body.name.trim()) errors.push('氏名は必須です。');
  if (!body.visaType || !VISA_TYPES.includes(body.visaType)) errors.push('在留資格を正しく選択してください。');
  if (!body.visaExpiryDate) errors.push('在留期限は必須です。');
  if (!body.statusType || !STATUS_TYPES.includes(body.statusType)) errors.push('制度区分を正しく選択してください。');
  return errors;
}

router.get('/visa-types', (req, res) => res.json(VISA_TYPES));
router.get('/status-types', (req, res) => res.json(STATUS_TYPES));
router.get('/stage-options', (req, res) => res.json(STAGE_OPTIONS));
router.get('/tokutei-training-statuses', (req, res) => res.json(TOKUTEI_TRAINING_STATUSES));
router.get('/special-health-check-types', (req, res) => res.json(SPECIAL_HEALTH_CHECK_TYPES));

router.get('/', async (req, res) => {
  const { statusType, hostCompanyId, search } = req.query;
  let result = await withJoinsAll(await workers.list());

  if (statusType) result = result.filter((w) => w.statusType === statusType);
  if (hostCompanyId) result = result.filter((w) => w.hostCompanyId === Number(hostCompanyId));
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.companyName.toLowerCase().includes(q) ||
        w.nationality.toLowerCase().includes(q)
    );
  }

  result.sort((a, b) => {
    const da = a.visaStatus.days;
    const db = b.visaStatus.days;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });

  res.json(result);
});

// 人材360: 対象者の詳細プロフィール + 関連する認定申請・面談監査記録・登録保険情報
router.get('/:id/profile360', async (req, res) => {
  const id = Number(req.params.id);
  const worker = await workers.get(id);
  if (!worker) return res.status(404).json({ error: '対象者が見つかりません。' });

  const cases = (await applicationCases.list()).filter((c) => c.workerId === id);
  const visits = (await visitsAudits.list()).filter((v) => v.workerId === id);
  const registrations = await workerRegistrations.listByWorker(id);

  res.json({
    worker: await withJoins(worker),
    applicationCases: cases.map((c) => ({ ...c, checklist: JSON.parse(c.checklist || '[]') })),
    visits,
    registrations,
  });
});

router.get('/:id', async (req, res) => {
  const worker = await workers.get(Number(req.params.id));
  if (!worker) return res.status(404).json({ error: '対象者が見つかりません。' });
  res.json(await withJoins(worker));
});

router.post('/', async (req, res) => {
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ errors });
  res.status(201).json(await withJoins(await workers.insert(buildRecord(req.body))));
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await workers.get(id);
  if (!existing) return res.status(404).json({ error: '対象者が見つかりません。' });
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ errors });
  res.json(await withJoins(await workers.update(id, buildRecord(req.body, existing))));
});

router.delete('/:id', async (req, res) => {
  const deleted = await workers.remove(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: '対象者が見つかりません。' });
  res.json({ ok: true });
});

// 登録・保険（対象者単位）
router.get('/:id/registrations', async (req, res) => {
  const workerId = Number(req.params.id);
  if (!(await workers.get(workerId))) return res.status(404).json({ error: '対象者が見つかりません。' });
  res.json(await workerRegistrations.listByWorker(workerId));
});

router.post('/:id/registrations', async (req, res) => {
  const workerId = Number(req.params.id);
  if (!(await workers.get(workerId))) return res.status(404).json({ error: '対象者が見つかりません。' });
  const label = (req.body.label || '').trim();
  if (!label) return res.status(400).json({ errors: ['項目名は必須です。'] });
  const record = await workerRegistrations.insert({
    workerId,
    label,
    registrationNumber: (req.body.registrationNumber || '').trim(),
    issueDate: req.body.issueDate || '',
    expiryDate: req.body.expiryDate || '',
    notes: (req.body.notes || '').trim(),
  });
  res.status(201).json(record);
});

router.put('/:id/registrations/:regId', async (req, res) => {
  const workerId = Number(req.params.id);
  const regId = Number(req.params.regId);
  const existing = await workerRegistrations.get(regId);
  if (!existing || existing.workerId !== workerId) {
    return res.status(404).json({ error: '登録項目が見つかりません。' });
  }
  const label = (req.body.label ?? existing.label).toString().trim();
  if (!label) return res.status(400).json({ errors: ['項目名は必須です。'] });
  const updated = await workerRegistrations.update(regId, {
    workerId,
    label,
    registrationNumber: (req.body.registrationNumber ?? existing.registrationNumber ?? '').toString().trim(),
    issueDate: req.body.issueDate ?? existing.issueDate ?? '',
    expiryDate: req.body.expiryDate ?? existing.expiryDate ?? '',
    notes: (req.body.notes ?? existing.notes ?? '').toString().trim(),
  });
  res.json(updated);
});

router.delete('/:id/registrations/:regId', async (req, res) => {
  const workerId = Number(req.params.id);
  const regId = Number(req.params.regId);
  const existing = await workerRegistrations.get(regId);
  if (!existing || existing.workerId !== workerId) {
    return res.status(404).json({ error: '登録項目が見つかりません。' });
  }
  await workerRegistrations.remove(regId);
  res.json({ ok: true });
});

router.get('/export/roster', async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('名簿');
  sheet.columns = [
    { header: '氏名', key: 'name', width: 20 },
    { header: 'フリガナ', key: 'nameKana', width: 20 },
    { header: '国籍', key: 'nationality', width: 12 },
    { header: '制度区分', key: 'statusType', width: 12 },
    { header: '在留資格', key: 'visaType', width: 14 },
    { header: '在留期限', key: 'visaExpiryDate', width: 14 },
    { header: '受入企業', key: 'companyName', width: 22 },
    { header: '送出機関', key: 'sendingOrgName', width: 20 },
    { header: '職種・作業', key: 'jobCategory', width: 22 },
    { header: 'ステータス', key: 'currentStage', width: 12 },
    { header: '電話番号', key: 'phone', width: 16 },
    { header: '備考', key: 'notes', width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };
  const rosterRows = await withJoinsAll(await workers.list());
  rosterRows.forEach((w) => sheet.addRow(w));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=meibo.xlsx');
  await workbook.xlsx.write(res);
  res.end();
});

router.get('/:id/document', async (req, res) => {
  const worker = await workers.get(Number(req.params.id));
  if (!worker) return res.status(404).json({ error: '対象者が見つかりません。' });
  const joined = await withJoins(worker);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('個人票');
  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 32;

  const title = `${joined.statusType} 個人票`;
  sheet.mergeCells('A1:B1');
  sheet.getCell('A1').value = title;
  sheet.getCell('A1').font = { bold: true, size: 14 };

  const rows = [
    ['氏名', joined.name],
    ['フリガナ', joined.nameKana],
    ['国籍', joined.nationality],
    ['性別', joined.gender],
    ['生年月日', joined.dob],
    ['旅券番号', joined.passportNumber],
    ['旅券有効期限', joined.passportExpiryDate],
    ['在留カード番号', joined.residenceCardNumber],
    ['制度区分', joined.statusType],
    ['在留資格', joined.visaType],
    ['在留期限', joined.visaExpiryDate],
    ['入国日', joined.entryDate],
    ['実習・就労開始日', joined.trainingStartDate],
    ['ステータス', joined.currentStage],
    ['受入企業', joined.companyName],
    ['送出機関', joined.sendingOrgName],
    ['職種・作業', joined.jobCategory],
    ['本国住所', joined.homeCountryAddress],
    ['学歴・職歴', joined.educationWorkHistory],
    ['雇用契約開始日', joined.contractStartDate],
    ['雇用契約終了日', joined.contractEndDate],
    ['基本賃金', joined.baseSalary],
    ['始業時刻', joined.workStartTime],
    ['終業時刻', joined.workEndTime],
    ['休日', joined.holidays],
    ['給料支払日', joined.payDate],
    ['宿舎情報', joined.dormitoryInfo],
    ['電話番号', joined.phone],
    ['備考', joined.notes],
  ];
  rows.forEach(([label, value]) => {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=kojinhyo_${joined.name || joined.id}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
