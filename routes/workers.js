const express = require('express');
const ExcelJS = require('exceljs');
const { workers, hostCompanies, sendingOrgs, applicationCases, visitsAudits } = require('../db');
const { getDaysUntil, getUrgency } = require('../lib/dates');

const router = express.Router();

const VISA_TYPES = ['技能実習1号', '技能実習2号', '技能実習3号', '育成就労', '特定技能1号', '特定技能2号'];
const STATUS_TYPES = ['技能実習', '育成就労', '特定技能'];

function withJoins(worker) {
  const company = worker.hostCompanyId ? hostCompanies.get(worker.hostCompanyId) : null;
  const sendingOrg = worker.sendingOrgId ? sendingOrgs.get(worker.sendingOrgId) : null;
  return {
    ...worker,
    companyName: company ? company.name : '',
    sendingOrgName: sendingOrg ? sendingOrg.name : '',
    visaStatus: getUrgency(getDaysUntil(worker.visaExpiryDate)),
  };
}

function buildRecord(body) {
  return {
    name: (body.name || '').trim(),
    nameKana: (body.nameKana || '').trim(),
    nationality: (body.nationality || '').trim(),
    gender: body.gender || '',
    dob: body.dob || '',
    passportNumber: (body.passportNumber || '').trim(),
    residenceCardNumber: (body.residenceCardNumber || '').trim(),
    visaType: body.visaType || '',
    visaExpiryDate: body.visaExpiryDate || '',
    entryDate: body.entryDate || '',
    hostCompanyId: body.hostCompanyId ? Number(body.hostCompanyId) : null,
    sendingOrgId: body.sendingOrgId ? Number(body.sendingOrgId) : null,
    jobCategory: (body.jobCategory || '').trim(),
    contractStartDate: body.contractStartDate || '',
    contractEndDate: body.contractEndDate || '',
    phone: (body.phone || '').trim(),
    notes: (body.notes || '').trim(),
    statusType: body.statusType || STATUS_TYPES[0],
    currentStage: (body.currentStage || '').trim(),
    baseSalary: body.baseSalary ? Number(body.baseSalary) : null,
    workingHours: (body.workingHours || '').trim(),
    overtimeRate: (body.overtimeRate || '').trim(),
    allowances: (body.allowances || '').trim(),
    deductions: (body.deductions || '').trim(),
    dormitoryInfo: (body.dormitoryInfo || '').trim(),
    healthCheckDate: body.healthCheckDate || '',
    consultationContact: (body.consultationContact || '').trim(),
    insuranceStatus: (body.insuranceStatus || '').trim(),
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

router.get('/', (req, res) => {
  const { statusType, hostCompanyId, search } = req.query;
  let result = workers.list().map(withJoins);

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

// 人材360: 対象者の詳細プロフィール + 関連する認定申請・面談監査記録
router.get('/:id/profile360', (req, res) => {
  const id = Number(req.params.id);
  const worker = workers.get(id);
  if (!worker) return res.status(404).json({ error: '対象者が見つかりません。' });

  const cases = applicationCases.list().filter((c) => c.workerId === id);
  const visits = visitsAudits.list().filter((v) => v.workerId === id);

  res.json({
    worker: withJoins(worker),
    applicationCases: cases.map((c) => ({ ...c, checklist: JSON.parse(c.checklist || '[]') })),
    visits,
  });
});

router.get('/:id', (req, res) => {
  const worker = workers.get(Number(req.params.id));
  if (!worker) return res.status(404).json({ error: '対象者が見つかりません。' });
  res.json(withJoins(worker));
});

router.post('/', (req, res) => {
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ errors });
  res.status(201).json(withJoins(workers.insert(buildRecord(req.body))));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!workers.get(id)) return res.status(404).json({ error: '対象者が見つかりません。' });
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ errors });
  res.json(withJoins(workers.update(id, buildRecord(req.body))));
});

router.delete('/:id', (req, res) => {
  const deleted = workers.remove(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: '対象者が見つかりません。' });
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
    { header: '電話番号', key: 'phone', width: 16 },
    { header: '備考', key: 'notes', width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };
  workers.list().map(withJoins).forEach((w) => sheet.addRow(w));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=meibo.xlsx');
  await workbook.xlsx.write(res);
  res.end();
});

router.get('/:id/document', async (req, res) => {
  const worker = workers.get(Number(req.params.id));
  if (!worker) return res.status(404).json({ error: '対象者が見つかりません。' });
  const joined = withJoins(worker);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('個人票');
  sheet.getColumn(1).width = 20;
  sheet.getColumn(2).width = 30;

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
    ['在留カード番号', joined.residenceCardNumber],
    ['制度区分', joined.statusType],
    ['在留資格', joined.visaType],
    ['在留期限', joined.visaExpiryDate],
    ['入国日', joined.entryDate],
    ['受入企業', joined.companyName],
    ['送出機関', joined.sendingOrgName],
    ['職種・作業', joined.jobCategory],
    ['雇用契約開始日', joined.contractStartDate],
    ['雇用契約終了日', joined.contractEndDate],
    ['基本賃金', joined.baseSalary],
    ['労働時間', joined.workingHours],
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
