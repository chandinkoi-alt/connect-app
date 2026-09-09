const express = require('express');
const { hostCompanies, companyRegistrations } = require('../db');
const { getDaysUntil, getUrgency } = require('../lib/dates');
const { getEffectiveExpiryDate } = require('../lib/companyRegistrationExpiry');

const router = express.Router();

// 一覧画面でひと目で確認できるようにする重要期限（36協定・責任者講習・建設業許可）。
// ラベルは lib/excelImport.js の取り込み時と揃えている。
const KEY_DEADLINE_LABELS = {
  agreement36: '36協定',
  managerTraining: '責任者講習受講日',
  constructionLicense: '建設業許可',
};

function buildKeyDeadlines(regsForCompany) {
  const regByLabel = new Map(regsForCompany.map((r) => [r.label, r]));
  const result = {};
  for (const [key, label] of Object.entries(KEY_DEADLINE_LABELS)) {
    const reg = regByLabel.get(label);
    const expiryDate = reg ? getEffectiveExpiryDate(reg) : '';
    const urgency = getUrgency(getDaysUntil(expiryDate));
    result[key] = { name: label, expiryDate, urgencyLabel: urgency.label, level: urgency.level, days: urgency.days };
  }
  return result;
}

const LEAD_STAGES = ['新規リード', '商談中', '条件交渉', '契約締結待ち', '契約済み'];
const YES_NO_UNKNOWN = ['適合', '不適合', '未確認'];
const LOCK_OPTIONS = ['有', '無', '未確認'];

const STATUS_OPTIONS = ['lead', 'active', 'withdrawn'];

function buildRecord(body, existing = {}) {
  const status = body.status || existing.status || 'lead';
  return {
    // companyNo（Excel由来の企業№）は通常の編集フォームからは送られてこないため、
    // 未指定の場合は既存値を保持する。明示的に指定された場合のみ上書きできる
    // （データ補正など、企業№自体を修正する必要があるケースのため）。
    companyNo: body.companyNo !== undefined ? (body.companyNo === null || body.companyNo === '' ? null : Number(body.companyNo)) : existing.companyNo ?? null,
    name: (body.name || '').trim(),
    industry: (body.industry || '').trim(),
    address: (body.address || '').trim(),
    contactPerson: (body.contactPerson || '').trim(),
    phone: (body.phone || '').trim(),
    email: (body.email || '').trim(),
    acceptanceStartDate: body.acceptanceStartDate || '',
    representativeName: (body.representativeName || '').trim(),
    regularEmployeeCount: body.regularEmployeeCount ? Number(body.regularEmployeeCount) : null,
    trainingManagerName: (body.trainingManagerName || '').trim(),
    skillInstructor: (body.skillInstructor || '').trim(),
    lifeInstructor: (body.lifeInstructor || '').trim(),
    dormitoryAddress: (body.dormitoryAddress || '').trim(),
    dormitoryMonthlyFee: body.dormitoryMonthlyFee ? Number(body.dormitoryMonthlyFee) : null,
    dormitoryRoomSizeOk: body.dormitoryRoomSizeOk || '',
    dormitoryHasLock: body.dormitoryHasLock || '',
    dormitoryHasValuablesStorage: body.dormitoryHasValuablesStorage || '',
    dormitoryInfo: (body.dormitoryInfo || '').trim(),
    notes: (body.notes || '').trim(),
    status,
    leadStage: status === 'lead' ? body.leadStage || existing.leadStage || LEAD_STAGES[0] : null,
    // 請求書（口座引落のご案内）の下部に表示する、この企業指定の引落口座番号
    // （下3〜4ケタのみ。振り込め詐欺対策等のため、全桁は保持しない）。
    bankAccountType: (body.bankAccountType || '').trim(),
    bankAccountLast3: (body.bankAccountLast3 || '').replace(/[^0-9]/g, '').slice(-4),
  };
}

router.get('/lead-stages', (req, res) => res.json(LEAD_STAGES));
router.get('/status-options', (req, res) => res.json(STATUS_OPTIONS));
router.get('/dormitory-options', (req, res) => res.json({ roomSizeOptions: YES_NO_UNKNOWN, lockOptions: LOCK_OPTIONS }));

router.get('/', async (req, res) => {
  const { status } = req.query;
  const [companies, allRegs] = await Promise.all([hostCompanies.list(), companyRegistrations.list()]);
  const regsByCompanyId = new Map();
  for (const r of allRegs) {
    if (!regsByCompanyId.has(r.hostCompanyId)) regsByCompanyId.set(r.hostCompanyId, []);
    regsByCompanyId.get(r.hostCompanyId).push(r);
  }
  let result = companies.map((c) => ({ ...c, keyDeadlines: buildKeyDeadlines(regsByCompanyId.get(c.id) || []) }));
  if (status) result = result.filter((c) => c.status === status);
  res.json(result);
});

router.get('/:id', async (req, res) => {
  const company = await hostCompanies.get(Number(req.params.id));
  if (!company) return res.status(404).json({ error: '企業が見つかりません。' });
  res.json(company);
});

router.post('/', async (req, res) => {
  if (!req.body.name || !req.body.name.trim()) {
    return res.status(400).json({ errors: ['企業名は必須です。'] });
  }
  res.status(201).json(await hostCompanies.insert(buildRecord(req.body)));
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await hostCompanies.get(id);
  if (!existing) return res.status(404).json({ error: '企業が見つかりません。' });
  if (!req.body.name || !req.body.name.trim()) {
    return res.status(400).json({ errors: ['企業名は必須です。'] });
  }
  res.json(await hostCompanies.update(id, buildRecord(req.body, existing)));
});

// カンバンでのステージ変更のみを行う（他の必須項目は不要）
router.put('/:id/stage', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await hostCompanies.get(id);
  if (!existing) return res.status(404).json({ error: '企業が見つかりません。' });
  if (!LEAD_STAGES.includes(req.body.leadStage)) {
    return res.status(400).json({ errors: ['ステージを正しく選択してください。'] });
  }
  res.json(await hostCompanies.update(id, { ...existing, leadStage: req.body.leadStage }));
});

// リードを正式な実習実施者（受入企業）として登録する
router.post('/:id/convert', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await hostCompanies.get(id);
  if (!existing) return res.status(404).json({ error: '企業が見つかりません。' });
  const record = buildRecord({ ...existing, status: 'active' }, existing);
  res.json(await hostCompanies.update(id, record));
});

// 在籍状態（受入中／退会）の切替のみを行う
router.put('/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await hostCompanies.get(id);
  if (!existing) return res.status(404).json({ error: '企業が見つかりません。' });
  if (!['active', 'withdrawn'].includes(req.body.status)) {
    return res.status(400).json({ errors: ['状態を正しく選択してください。'] });
  }
  res.json(await hostCompanies.update(id, buildRecord({ ...existing, status: req.body.status }, existing)));
});

router.delete('/:id', async (req, res) => {
  const deleted = await hostCompanies.remove(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: '企業が見つかりません。' });
  res.json({ ok: true });
});

// 登録・保険・許認可（会社単位）
router.get('/:id/registrations', async (req, res) => {
  const hostCompanyId = Number(req.params.id);
  if (!(await hostCompanies.get(hostCompanyId))) return res.status(404).json({ error: '企業が見つかりません。' });
  res.json(await companyRegistrations.listByCompany(hostCompanyId));
});

router.post('/:id/registrations', async (req, res) => {
  const hostCompanyId = Number(req.params.id);
  if (!(await hostCompanies.get(hostCompanyId))) return res.status(404).json({ error: '企業が見つかりません。' });
  const label = (req.body.label || '').trim();
  if (!label) return res.status(400).json({ errors: ['項目名は必須です。'] });
  const record = await companyRegistrations.insert({
    hostCompanyId,
    label,
    registrationNumber: (req.body.registrationNumber || '').trim(),
    issueDate: req.body.issueDate || '',
    expiryDate: req.body.expiryDate || '',
    notes: (req.body.notes || '').trim(),
  });
  res.status(201).json(record);
});

router.put('/:id/registrations/:regId', async (req, res) => {
  const hostCompanyId = Number(req.params.id);
  const regId = Number(req.params.regId);
  const existing = await companyRegistrations.get(regId);
  if (!existing || existing.hostCompanyId !== hostCompanyId) {
    return res.status(404).json({ error: '登録項目が見つかりません。' });
  }
  const label = (req.body.label ?? existing.label).toString().trim();
  if (!label) return res.status(400).json({ errors: ['項目名は必須です。'] });
  const updated = await companyRegistrations.update(regId, {
    hostCompanyId,
    label,
    registrationNumber: (req.body.registrationNumber ?? existing.registrationNumber ?? '').toString().trim(),
    issueDate: req.body.issueDate ?? existing.issueDate ?? '',
    expiryDate: req.body.expiryDate ?? existing.expiryDate ?? '',
    notes: (req.body.notes ?? existing.notes ?? '').toString().trim(),
  });
  res.json(updated);
});

router.delete('/:id/registrations/:regId', async (req, res) => {
  const hostCompanyId = Number(req.params.id);
  const regId = Number(req.params.regId);
  const existing = await companyRegistrations.get(regId);
  if (!existing || existing.hostCompanyId !== hostCompanyId) {
    return res.status(404).json({ error: '登録項目が見つかりません。' });
  }
  await companyRegistrations.remove(regId);
  res.json({ ok: true });
});

module.exports = router;
