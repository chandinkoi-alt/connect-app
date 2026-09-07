const express = require('express');
const { applicationCases, workers, hostCompanies } = require('../db');
const { buildChecklist } = require('../lib/checklists');

const router = express.Router();

const STATUSES = ['書類準備中', '提出済み', '追加書類対応中', '認定済み'];

function withJoins(appCase) {
  const worker = appCase.workerId ? workers.get(appCase.workerId) : null;
  const company = worker && worker.hostCompanyId ? hostCompanies.get(worker.hostCompanyId) : null;
  return {
    ...appCase,
    checklist: JSON.parse(appCase.checklist || '[]'),
    workerName: worker ? worker.name : '',
    companyName: company ? company.name : '',
  };
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

router.get('/', (req, res) => {
  const { workerId, companyId, status } = req.query;
  let result = applicationCases.list().map(withJoins);
  if (workerId) result = result.filter((c) => c.workerId === Number(workerId));
  if (status) result = result.filter((c) => c.status === status);
  if (companyId) {
    result = result.filter((c) => {
      const worker = workers.get(c.workerId);
      return worker && worker.hostCompanyId === Number(companyId);
    });
  }
  res.json(result);
});

router.get('/:id', (req, res) => {
  const item = applicationCases.get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: '申請案件が見つかりません。' });
  res.json(withJoins(item));
});

router.post('/', (req, res) => {
  if (!req.body.workerId) return res.status(400).json({ errors: ['対象者を選択してください。'] });
  if (!req.body.statusType) return res.status(400).json({ errors: ['制度区分を選択してください。'] });
  res.status(201).json(withJoins(applicationCases.insert(buildRecord(req.body))));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = applicationCases.get(id);
  if (!existing) return res.status(404).json({ error: '申請案件が見つかりません。' });
  res.json(withJoins(applicationCases.update(id, buildRecord(req.body, existing))));
});

// チェックリスト項目のON/OFF切替
router.put('/:id/checklist', (req, res) => {
  const id = Number(req.params.id);
  const existing = applicationCases.get(id);
  if (!existing) return res.status(404).json({ error: '申請案件が見つかりません。' });
  const { index, done } = req.body;
  const checklist = JSON.parse(existing.checklist || '[]');
  if (!checklist[index]) return res.status(400).json({ error: '不正な項目です。' });
  checklist[index].done = !!done;
  res.json(withJoins(applicationCases.update(id, { ...existing, checklist: JSON.stringify(checklist) })));
});

router.delete('/:id', (req, res) => {
  const deleted = applicationCases.remove(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: '申請案件が見つかりません。' });
  res.json({ ok: true });
});

module.exports = router;
