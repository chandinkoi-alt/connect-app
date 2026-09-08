const express = require('express');
const { hostCompanies, companyRegistrations } = require('../db');

const router = express.Router();

const LEAD_STAGES = ['新規リード', '商談中', '条件交渉', '契約締結待ち', '契約済み'];
const YES_NO_UNKNOWN = ['適合', '不適合', '未確認'];
const LOCK_OPTIONS = ['有', '無', '未確認'];

const STATUS_OPTIONS = ['lead', 'active', 'withdrawn'];

function buildRecord(body, existing = {}) {
  const status = body.status || existing.status || 'lead';
  return {
    companyNo: existing.companyNo ?? null,
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
  };
}

router.get('/lead-stages', (req, res) => res.json(LEAD_STAGES));
router.get('/status-options', (req, res) => res.json(STATUS_OPTIONS));
router.get('/dormitory-options', (req, res) => res.json({ roomSizeOptions: YES_NO_UNKNOWN, lockOptions: LOCK_OPTIONS }));

router.get('/', async (req, res) => {
  const { status } = req.query;
  let result = await hostCompanies.list();
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
