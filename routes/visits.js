const express = require('express');
const { visitsAudits, workers, hostCompanies } = require('../db');
const { getDaysUntil, getUrgency } = require('../lib/dates');
// 監査・面談の自動スケジュール生成は、ユーザーの希望により無効化している
// （全件削除後も自動で復活してしまい、手動管理したいという要望のため）。
// lib/visitScheduler.js 自体は削除せず残してあるので、必要になれば
// 下のensureVisitSchedule()呼び出しを再度有効にするだけで元に戻せる。
// const { ensureVisitSchedule } = require('../lib/visitScheduler');

const router = express.Router();

const VISIT_TYPES = ['訪問指導', '監査', '面談'];

function joinVisit(item, workerById, companyById) {
  const worker = item.workerId ? workerById.get(item.workerId) : null;
  const company = item.hostCompanyId ? companyById.get(item.hostCompanyId) : null;
  return {
    ...item,
    workerName: worker ? worker.name : '',
    companyName: company ? company.name : '',
    urgency: item.completedDate ? { label: '実施済み', level: 'ok', days: null } : getUrgency(getDaysUntil(item.scheduledDate), 14),
  };
}

async function withJoins(item) {
  const worker = item.workerId ? await workers.get(item.workerId) : null;
  const company = item.hostCompanyId ? await hostCompanies.get(item.hostCompanyId) : null;
  return joinVisit(
    item,
    new Map(worker ? [[worker.id, worker]] : []),
    new Map(company ? [[company.id, company]] : [])
  );
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
  const [allVisits, allWorkers, allCompanies] = await Promise.all([
    visitsAudits.list(),
    workers.list(),
    hostCompanies.list(),
  ]);
  const workerById = new Map(allWorkers.map((w) => [w.id, w]));
  const companyById = new Map(allCompanies.map((c) => [c.id, c]));
  let result = allVisits.map((v) => joinVisit(v, workerById, companyById));
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
