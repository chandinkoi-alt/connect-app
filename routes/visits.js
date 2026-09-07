const express = require('express');
const { visitsAudits, workers, hostCompanies } = require('../db');
const { getDaysUntil, getUrgency } = require('../lib/dates');

const router = express.Router();

const VISIT_TYPES = ['訪問指導', '監査'];

async function withJoins(item) {
  const worker = item.workerId ? await workers.get(item.workerId) : null;
  const company = item.hostCompanyId ? await hostCompanies.get(item.hostCompanyId) : null;
  return {
    ...item,
    workerName: worker ? worker.name : '',
    companyName: company ? company.name : '',
    urgency: item.completedDate ? { label: '実施済み', level: 'ok', days: null } : getUrgency(getDaysUntil(item.scheduledDate), 14),
  };
}

function buildRecord(body, existing = {}) {
  return {
    workerId: body.workerId ? Number(body.workerId) : existing.workerId || null,
    hostCompanyId: body.hostCompanyId ? Number(body.hostCompanyId) : existing.hostCompanyId || null,
    type: body.type || existing.type || VISIT_TYPES[0],
    scheduledDate: body.scheduledDate || existing.scheduledDate || '',
    completedDate: body.completedDate ?? existing.completedDate ?? '',
    result: (body.result ?? existing.result ?? '').toString().trim(),
    notes: (body.notes ?? existing.notes ?? '').toString().trim(),
  };
}

router.get('/types', (req, res) => res.json(VISIT_TYPES));

router.get('/', async (req, res) => {
  const { workerId, hostCompanyId, type } = req.query;
  let result = await Promise.all((await visitsAudits.list()).map(withJoins));
  if (workerId) result = result.filter((v) => v.workerId === Number(workerId));
  if (hostCompanyId) result = result.filter((v) => v.hostCompanyId === Number(hostCompanyId));
  if (type) result = result.filter((v) => v.type === type);

  result.sort((a, b) => {
    const da = a.urgency.days;
    const db = b.urgency.days;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });

  res.json(result);
});

router.get('/:id', async (req, res) => {
  const item = await visitsAudits.get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: '記録が見つかりません。' });
  res.json(await withJoins(item));
});

router.post('/', async (req, res) => {
  if (!req.body.scheduledDate) return res.status(400).json({ errors: ['予定日は必須です。'] });
  if (!VISIT_TYPES.includes(req.body.type)) return res.status(400).json({ errors: ['種別を正しく選択してください。'] });
  res.status(201).json(await withJoins(await visitsAudits.insert(buildRecord(req.body))));
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await visitsAudits.get(id);
  if (!existing) return res.status(404).json({ error: '記録が見つかりません。' });
  res.json(await withJoins(await visitsAudits.update(id, buildRecord(req.body, existing))));
});

router.delete('/:id', async (req, res) => {
  const deleted = await visitsAudits.remove(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: '記録が見つかりません。' });
  res.json({ ok: true });
});

module.exports = router;
