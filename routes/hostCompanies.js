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

router.delete('/:id', async (req, res) => {
  const deleted = await hostCompanies.remove(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: '企業が見つかりません。' });
  res.json({ ok: true });
});

module.exports = router;
