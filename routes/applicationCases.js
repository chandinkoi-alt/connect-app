const express = require('express');
const { applicationCases, workers, hostCompanies, companyOfficers, sendingOrgs } = require('../db');
const { buildChecklist } = require('../lib/checklists');
const { generateNinteiPdf } = require('../lib/nintei-form/generatePdf');
const { SUPERVISING_ORG } = require('../lib/certificationSettings');

const router = express.Router();

const STATUSES = ['書類準備中', '提出済み', '追加書類対応中', '認定済み'];

// 技能実習の区分（技能実習計画認定申請書 第2面「４ 技能実習の区分」）
// A/D=第1号、B/E=第2号、C/F=第3号。A・B・C=企業単独型、D・E・F=団体監理型。
const PLAN_TYPES = [
  { code: 'A', label: 'A（第一号企業単独型）' },
  { code: 'B', label: 'B（第二号企業単独型）' },
  { code: 'C', label: 'C（第三号企業単独型）' },
  { code: 'D', label: 'D（第一号団体監理型）' },
  { code: 'E', label: 'E（第二号団体監理型）' },
  { code: 'F', label: 'F（第三号団体監理型）' },
];

function joinCase(appCase, workerById, companyById) {
  const worker = appCase.workerId ? workerById.get(appCase.workerId) : null;
  const company = worker && worker.hostCompanyId ? companyById.get(worker.hostCompanyId) : null;
  return {
    ...appCase,
    checklist: JSON.parse(appCase.checklist || '[]'),
    trainingContentItems: JSON.parse(appCase.trainingContentItems || '[]'),
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
    // 技能実習計画認定申請書（第1・2・7面）用
    applicationDate: body.applicationDate ?? existing.applicationDate ?? '',
    planCreationDate: body.planCreationDate ?? existing.planCreationDate ?? '',
    planType: body.planType ?? existing.planType ?? '',
    jobCategoryCode: (body.jobCategoryCode ?? existing.jobCategoryCode ?? '').toString().trim(),
    jobCategoryName: (body.jobCategoryName ?? existing.jobCategoryName ?? '').toString().trim(),
    workName: (body.workName ?? existing.workName ?? '').toString().trim(),
    jobCategoryFreeText: (body.jobCategoryFreeText ?? existing.jobCategoryFreeText ?? '').toString().trim(),
    trainingGoalType: body.trainingGoalType ?? existing.trainingGoalType ?? '',
    trainingGoalDetail: (body.trainingGoalDetail ?? existing.trainingGoalDetail ?? '').toString().trim(),
    priorStageGoalType: body.priorStageGoalType ?? existing.priorStageGoalType ?? '',
    priorStageGoalDetail: (body.priorStageGoalDetail ?? existing.priorStageGoalDetail ?? '').toString().trim(),
    priorApprovalNumber: (body.priorApprovalNumber ?? existing.priorApprovalNumber ?? '').toString().trim(),
    trainingPeriodStart: body.trainingPeriodStart ?? existing.trainingPeriodStart ?? '',
    trainingPeriodEnd: body.trainingPeriodEnd ?? existing.trainingPeriodEnd ?? '',
    orientationHours: body.orientationHours !== undefined ? Number(body.orientationHours) || null : existing.orientationHours ?? null,
    practicalHours: body.practicalHours !== undefined ? Number(body.practicalHours) || null : existing.practicalHours ?? null,
    remarks: (body.remarks ?? existing.remarks ?? '').toString().trim(),
    hasDifficultyNotification: body.hasDifficultyNotification ?? existing.hasDifficultyNotification ?? '',
    planGuidanceStaffName: (body.planGuidanceStaffName ?? existing.planGuidanceStaffName ?? '').toString().trim(),
    // 実習実施予定表（第4面、1号＝A・Dのみ）用
    trainingMaterials: (body.trainingMaterials ?? existing.trainingMaterials ?? '').toString().trim(),
    trainingTools: (body.trainingTools ?? existing.trainingTools ?? '').toString().trim(),
    trainingContentItems: body.trainingContentItems
      ? JSON.stringify(body.trainingContentItems)
      : existing.trainingContentItems || '[]',
  };
}

router.get('/statuses', (req, res) => res.json(STATUSES));
router.get('/plan-types', (req, res) => res.json(PLAN_TYPES));

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

// 技能実習計画認定申請書（別記様式第１号、第1・2・7面）のPDFを出力する。
// 外国人技能実習機構の実物Word様式にpython-docxで直接書き込み、
// LibreOffice headlessでPDF変換する（lib/nintei-form/）。
router.get('/:id/pdf', async (req, res) => {
  const id = Number(req.params.id);
  const ac = await applicationCases.get(id);
  if (!ac) return res.status(404).json({ error: '申請案件が見つかりません。' });

  const worker = ac.workerId ? await workers.get(ac.workerId) : null;
  const company = worker && worker.hostCompanyId ? await hostCompanies.get(worker.hostCompanyId) : null;
  const sendingOrg = worker && worker.sendingOrgId ? await sendingOrgs.get(worker.sendingOrgId) : null;
  const officers = company ? await companyOfficers.listByCompany(company.id) : [];

  try {
    const pdfBuffer = await generateNinteiPdf({
      company,
      worker,
      applicationCase: { ...ac, trainingContentItems: JSON.parse(ac.trainingContentItems || '[]') },
      officers,
      sendingOrg,
      supervisingOrg: SUPERVISING_ORG,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=nintei_shinsei_${id}.pdf`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('認定申請書PDF生成エラー:', err);
    res.status(500).json({ error: '様式の生成に失敗しました。しばらくしてから再度お試しください。' });
  }
});

module.exports = router;
