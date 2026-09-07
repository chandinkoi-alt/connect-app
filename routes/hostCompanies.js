const express = require('express');
const { hostCompanies } = require('../db');

const router = express.Router();

const LEAD_STAGES = ['新規リード', '商談中', '条件交渉', '契約締結待ち', '契約済み'];

function buildRecord(body, existing = {}) {
  return {
    name: (body.name || '').trim(),
    address: (body.address || '').trim(),
    contactPerson: (body.contactPerson || '').trim(),
    skillInstructor: (body.skillInstructor || '').trim(),
    lifeInstructor: (body.lifeInstructor || '').trim(),
    dormitoryInfo: (body.dormitoryInfo || '').trim(),
    phone: (body.phone || '').trim(),
    notes: (body.notes || '').trim(),
    status: body.status || existing.status || 'lead',
    leadStage: body.status === 'active' ? null : body.leadStage || existing.leadStage || LEAD_STAGES[0],
  };
}

router.get('/lead-stages', (req, res) => res.json(LEAD_STAGES));

router.get('/', (req, res) => {
  const { status } = req.query;
  let result = hostCompanies.list();
  if (status) result = result.filter((c) => c.status === status);
  res.json(result);
});

router.get('/:id', (req, res) => {
  const company = hostCompanies.get(Number(req.params.id));
  if (!company) return res.status(404).json({ error: '企業が見つかりません。' });
  res.json(company);
});

router.post('/', (req, res) => {
  if (!req.body.name || !req.body.name.trim()) {
    return res.status(400).json({ errors: ['企業名は必須です。'] });
  }
  res.status(201).json(hostCompanies.insert(buildRecord(req.body)));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = hostCompanies.get(id);
  if (!existing) return res.status(404).json({ error: '企業が見つかりません。' });
  if (!req.body.name || !req.body.name.trim()) {
    return res.status(400).json({ errors: ['企業名は必須です。'] });
  }
  res.json(hostCompanies.update(id, buildRecord(req.body, existing)));
});

// カンバンでのステージ変更のみを行う（他の必須項目は不要）
router.put('/:id/stage', (req, res) => {
  const id = Number(req.params.id);
  const existing = hostCompanies.get(id);
  if (!existing) return res.status(404).json({ error: '企業が見つかりません。' });
  if (!LEAD_STAGES.includes(req.body.leadStage)) {
    return res.status(400).json({ errors: ['ステージを正しく選択してください。'] });
  }
  res.json(hostCompanies.update(id, { ...existing, leadStage: req.body.leadStage }));
});

// リードを正式な実習実施者（受入企業）として登録する
router.post('/:id/convert', (req, res) => {
  const id = Number(req.params.id);
  const existing = hostCompanies.get(id);
  if (!existing) return res.status(404).json({ error: '企業が見つかりません。' });
  const record = buildRecord({ ...existing, status: 'active' }, existing);
  res.json(hostCompanies.update(id, record));
});

router.delete('/:id', (req, res) => {
  const deleted = hostCompanies.remove(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: '企業が見つかりません。' });
  res.json({ ok: true });
});

module.exports = router;
