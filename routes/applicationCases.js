const express = require('express');
const { applicationCases, workers, hostCompanies } = require('../db');
const { buildChecklist } = require('../lib/checklists');

const router = express.Router();

const STATUSES = ['書類準備中', '提出済み', '追加書類対応中', '認定済み'];

function joinCase(appCase, workerById, companyById) {
  const worker = appCase.workerId ? workerById.get(appCase.workerId) : null;
  const company = worker && worker.hostCompanyId ? companyById.get(worker.hostCompanyId) : null;
  return {
    ...appCase,
    checklist: JSON.parse(appCase.checklist || '[]'),
    workerName: worker ? worker.name : '',
    workerPersonalNo: worker ? worker.personalNo : null,
    companyName: company ? company.name : '',
    companyNo: company ? company.companyNo : null,
  };
}

async function withJoins(appCase) {
  const worker = appCase.workerId ? await workers.get(appCase.workerId) : null;
  const company = worker && worker.hostCompanyId ? await hostCompanies.get(worker.hostCompanyId) : null;
  return joinCase(
    appCase,
    new Map(worker ? [[worker.id, worker]] : []),
    new Map(company ? [[company.id, company]] : [])
  );
}

function buildRecord(body, existing = {}) {
  return {
    workerId: Number(body.workerId ?? existing.workerId),
    statusType: body.statusType || existing.statusType,
    stage: (body.stage || existing.stage || '').trim(),
    status: body.status || existing.status || STATUSES[0],
    dueDate: body.dueDate ?? existing.dueDate ?? '',
    submittedDate: body.submittedDate ?? existing.submittedDate ?? '',
    approvedDate: body.approvedDate ?? existing.approvedDate ?? '',
    notes: (body.notes ?? existing.notes ?? '').toString().trim(),
    checklist: body.checklist
      ? JSON.stringify(body.checklist)
      : existing.checklist || JSON.stringify(buildChecklist(body.statusType || existing.statusType)),
  };
}

router.get('/statuses', (req, res) => res.json(STATUSES));

router.get('/', async (req, res) => {
  const { workerId, companyId, status } = req.query;
  const [allCases, allWorkers, allCompanies] = await Promise.all([
    applicationCases.list(),
    workers.list(),
    hostCompanies.list(),
  ]);
  const workerById = new Map(allWorkers.map((w) => [w.id, w]));
  const companyById = new Map(allCompanies.map((c) => [c.id, c]));

  let result = allCases.map((c) => joinCase(c, workerById, companyById));
  if (workerId) result = result.filter((c) => c.workerId === Number(workerId));
  if (status) result = result.filter((c) => c.status === status);
  if (companyId) {
    result = result.filter((c) => {
      const worker = workerById.get(c.workerId);
      return worker && worker.hostCompanyId === Number(companyId);
    });
  }
  res.json(result);
});

router.get('/:id', async (req, res) => {
  const item = await applicationCases.get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: '申請案件が見つかりません。' });
  res.json(await withJoins(item));
});

router.post('/', async (req, res) => {
  if (!req.body.workerId) return res.status(400).json({ errors: ['対象者を選択してください。'] });
  if (!req.body.statusType) return res.status(400).json({ errors: ['制度区分を選択してください。'] });
  res.status(201).json(await withJoins(await applicationCases.insert(buildRecord(req.body))));
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await applicationCases.get(id);
  if (!existing) return res.status(404).json({ error: '申請案件が見つかりません。' });
  res.json(await withJoins(await applicationCases.update(id, buildRecord(req.body, existing))));
});

// チェックリスト項目のON/OFF切替
router.put('/:id/checklist', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await applicationCases.get(id);
  if (!existing) return res.status(404).json({ error: '申請案件が見つかりません。' });
  const { index, done } = req.body;
  const checklist = JSON.parse(existing.checklist || '[]');
  if (!checklist[index]) return res.status(400).json({ error: '不正な項目です。' });
  checklist[index].done = !!done;
  res.json(await withJoins(await applicationCases.update(id, { ...existing, checklist: JSON.stringify(checklist) })));
});

router.delete('/:id', async (req, res) => {
  const deleted = await applicationCases.remove(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: '申請案件が見つかりません。' });
  res.json({ ok: true });
});

module.exports = router;
