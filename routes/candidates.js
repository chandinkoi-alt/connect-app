const express = require('express');
const { candidates, workers, applicationCases } = require('../db');
const { buildChecklist } = require('../lib/checklists');

const router = express.Router();

const CANDIDATE_STAGES = ['エントリー', '面接調整中', '面接済み', '内定', '採用確定'];

function buildRecord(body, existing = {}) {
  return {
    name: (body.name || '').trim(),
    nationality: (body.nationality || '').trim(),
    sendingOrgId: body.sendingOrgId ? Number(body.sendingOrgId) : null,
    interviewDate: body.interviewDate || '',
    stage: body.stage || existing.stage || CANDIDATE_STAGES[0],
    notes: (body.notes || '').trim(),
  };
}

router.get('/stages', (req, res) => res.json(CANDIDATE_STAGES));

router.get('/', async (req, res) => {
  res.json(await candidates.list());
});

router.get('/:id', async (req, res) => {
  const candidate = await candidates.get(Number(req.params.id));
  if (!candidate) return res.status(404).json({ error: '候補者が見つかりません。' });
  res.json(candidate);
});

router.post('/', async (req, res) => {
  if (!req.body.name || !req.body.name.trim()) {
    return res.status(400).json({ errors: ['氏名は必須です。'] });
  }
  res.status(201).json(await candidates.insert(buildRecord(req.body)));
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await candidates.get(id);
  if (!existing) return res.status(404).json({ error: '候補者が見つかりません。' });
  if (!req.body.name || !req.body.name.trim()) {
    return res.status(400).json({ errors: ['氏名は必須です。'] });
  }
  res.json(await candidates.update(id, buildRecord(req.body, existing)));
});

// カンバンでのステージ変更のみを行う（他の必須項目は不要）
router.put('/:id/stage', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await candidates.get(id);
  if (!existing) return res.status(404).json({ error: '候補者が見つかりません。' });
  if (!CANDIDATE_STAGES.includes(req.body.stage)) {
    return res.status(400).json({ errors: ['ステージを正しく選択してください。'] });
  }
  res.json(await candidates.update(id, { ...existing, stage: req.body.stage }));
});

// 採用確定した候補者を実習生・対象者として登録し、認定申請の下書きを自動作成する
router.post('/:id/hire', async (req, res) => {
  const id = Number(req.params.id);
  const candidate = await candidates.get(id);
  if (!candidate) return res.status(404).json({ error: '候補者が見つかりません。' });

  const { hostCompanyId, statusType, visaType, visaExpiryDate } = req.body;
  const errors = [];
  if (!hostCompanyId) errors.push('受入企業を選択してください。');
  if (!statusType) errors.push('在留資格区分を選択してください。');
  if (!visaType) errors.push('在留資格を選択してください。');
  if (!visaExpiryDate) errors.push('在留期限を入力してください。');
  if (errors.length) return res.status(400).json({ errors });

  const worker = await workers.insert({
    name: candidate.name,
    nameKana: '',
    nationality: candidate.nationality,
    gender: '',
    dob: '',
    passportNumber: '',
    residenceCardNumber: '',
    visaType,
    visaExpiryDate,
    entryDate: '',
    hostCompanyId: Number(hostCompanyId),
    sendingOrgId: candidate.sendingOrgId,
    jobCategory: '',
    contractStartDate: '',
    contractEndDate: '',
    phone: '',
    notes: `候補者ID ${candidate.id} より登録`,
    statusType,
    currentStage: '入国前',
    baseSalary: null,
    workingHours: '',
    overtimeRate: '',
    allowances: '',
    deductions: '',
    dormitoryInfo: '',
    healthCheckDate: '',
    consultationContact: '',
    insuranceStatus: '',
  });

  const applicationCase = await applicationCases.insert({
    workerId: worker.id,
    statusType,
    stage: '初回申請',
    status: '書類準備中',
    dueDate: '',
    submittedDate: '',
    approvedDate: '',
    notes: '',
    checklist: JSON.stringify(buildChecklist(statusType)),
  });

  await candidates.update(id, buildRecord({ ...candidate, stage: '採用確定' }, candidate));

  res.status(201).json({ worker, applicationCase });
});

router.delete('/:id', async (req, res) => {
  const deleted = await candidates.remove(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: '候補者が見つかりません。' });
  res.json({ ok: true });
});

module.exports = router;
