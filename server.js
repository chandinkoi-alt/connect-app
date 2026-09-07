const express = require('express');
const cors = require('cors');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const VISA_TYPES = ['技能実習1号', '技能実習2号', '技能実習3号', '特定技能1号', '特定技能2号'];
const EXPIRY_WARNING_DAYS = 90;

function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return null;
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function getVisaStatus(expiryDate) {
  const days = getDaysUntil(expiryDate);
  if (days === null) return { label: '未設定', level: 'unknown', days: null };
  if (days < 0) return { label: '期限切れ', level: 'expired', days };
  if (days <= EXPIRY_WARNING_DAYS) return { label: '期限間近', level: 'warning', days };
  return { label: '在留中', level: 'ok', days };
}

function withStatus(worker) {
  return { ...worker, visaStatus: getVisaStatus(worker.visaExpiryDate) };
}

let workers = [];
let nextId = 1;

function validateWorker(body) {
  const errors = [];
  if (!body.name || !body.name.trim()) errors.push('氏名は必須です。');
  if (!body.companyName || !body.companyName.trim()) errors.push('受入企業は必須です。');
  if (!body.visaType || !VISA_TYPES.includes(body.visaType)) errors.push('在留資格を正しく選択してください。');
  if (!body.visaExpiryDate) errors.push('在留期限は必須です。');
  return errors;
}

function buildWorkerRecord(body, existing = {}) {
  return {
    id: existing.id,
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
    companyName: (body.companyName || '').trim(),
    jobCategory: (body.jobCategory || '').trim(),
    contractStartDate: body.contractStartDate || '',
    contractEndDate: body.contractEndDate || '',
    phone: (body.phone || '').trim(),
    notes: (body.notes || '').trim(),
  };
}

app.get('/health', (req, res) => res.send('OK'));

app.get('/api/visa-types', (req, res) => res.json(VISA_TYPES));

app.get('/api/workers', (req, res) => {
  const { visaType, search } = req.query;
  let result = workers.map(withStatus);

  if (visaType) {
    result = result.filter((w) => w.visaType === visaType);
  }
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

app.get('/api/workers/:id', (req, res) => {
  const worker = workers.find((w) => w.id === Number(req.params.id));
  if (!worker) return res.status(404).json({ error: '対象者が見つかりません。' });
  res.json(withStatus(worker));
});

app.post('/api/workers', (req, res) => {
  const errors = validateWorker(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const record = buildWorkerRecord(req.body, { id: nextId++ });
  workers.push(record);
  res.status(201).json(withStatus(record));
});

app.put('/api/workers/:id', (req, res) => {
  const idx = workers.findIndex((w) => w.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: '対象者が見つかりません。' });

  const errors = validateWorker(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const record = buildWorkerRecord(req.body, { id: workers[idx].id });
  workers[idx] = record;
  res.json(withStatus(record));
});

app.delete('/api/workers/:id', (req, res) => {
  const before = workers.length;
  workers = workers.filter((w) => w.id !== Number(req.params.id));
  if (workers.length === before) return res.status(404).json({ error: '対象者が見つかりません。' });
  res.json({ ok: true });
});

app.get('/api/stats', (req, res) => {
  const withStatuses = workers.map(withStatus);
  res.json({
    total: workers.length,
    ginouJisshu: workers.filter((w) => w.visaType.startsWith('技能実習')).length,
    tokuteiGinou: workers.filter((w) => w.visaType.startsWith('特定技能')).length,
    expired: withStatuses.filter((w) => w.visaStatus.level === 'expired').length,
    expiringSoon: withStatuses.filter((w) => w.visaStatus.level === 'warning').length,
  });
});

// 対象者一覧の名簿を Excel で出力
app.get('/api/export', async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('名簿');
  sheet.columns = [
    { header: '氏名', key: 'name', width: 20 },
    { header: 'フリガナ', key: 'nameKana', width: 20 },
    { header: '国籍', key: 'nationality', width: 12 },
    { header: '性別', key: 'gender', width: 8 },
    { header: '生年月日', key: 'dob', width: 14 },
    { header: '旅券番号', key: 'passportNumber', width: 16 },
    { header: '在留カード番号', key: 'residenceCardNumber', width: 18 },
    { header: '在留資格', key: 'visaType', width: 14 },
    { header: '在留期限', key: 'visaExpiryDate', width: 14 },
    { header: '入国日', key: 'entryDate', width: 14 },
    { header: '受入企業', key: 'companyName', width: 22 },
    { header: '職種・作業', key: 'jobCategory', width: 22 },
    { header: '雇用契約開始日', key: 'contractStartDate', width: 16 },
    { header: '雇用契約終了日', key: 'contractEndDate', width: 16 },
    { header: '電話番号', key: 'phone', width: 16 },
    { header: '備考', key: 'notes', width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };
  workers.forEach((w) => sheet.addRow(w));

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename=meibo.xlsx');
  await workbook.xlsx.write(res);
  res.end();
});

// 個人別の書類（技能実習生・特定技能外国人 個人票）を Excel で出力
app.get('/api/workers/:id/document', async (req, res) => {
  const worker = workers.find((w) => w.id === Number(req.params.id));
  if (!worker) return res.status(404).json({ error: '対象者が見つかりません。' });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('個人票');
  sheet.getColumn(1).width = 20;
  sheet.getColumn(2).width = 30;

  const title = worker.visaType.startsWith('特定技能')
    ? '特定技能外国人 個人票'
    : '技能実習生 個人票';

  sheet.mergeCells('A1:B1');
  sheet.getCell('A1').value = title;
  sheet.getCell('A1').font = { bold: true, size: 14 };

  const rows = [
    ['氏名', worker.name],
    ['フリガナ', worker.nameKana],
    ['国籍', worker.nationality],
    ['性別', worker.gender],
    ['生年月日', worker.dob],
    ['旅券番号', worker.passportNumber],
    ['在留カード番号', worker.residenceCardNumber],
    ['在留資格', worker.visaType],
    ['在留期限', worker.visaExpiryDate],
    ['入国日', worker.entryDate],
    ['受入企業', worker.companyName],
    ['職種・作業', worker.jobCategory],
    ['雇用契約開始日', worker.contractStartDate],
    ['雇用契約終了日', worker.contractEndDate],
    ['電話番号', worker.phone],
    ['備考', worker.notes],
  ];
  rows.forEach(([label, value]) => {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=kojinhyo_${worker.name || worker.id}.xlsx`
  );
  await workbook.xlsx.write(res);
  res.end();
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = { getVisaStatus, getDaysUntil };
