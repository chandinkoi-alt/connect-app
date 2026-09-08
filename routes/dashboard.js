const express = require('express');
const {
  workers,
  hostCompanies,
  applicationCases,
  visitsAudits,
  companyRegistrations,
  workerRegistrations,
  sendingOrgs,
} = require('../db');
const { getDaysUntil, getUrgency } = require('../lib/dates');

const router = express.Router();

// 既に帰国済み・失踪の対象者は在留期限が切れていても対応不要のため対象外とする
const INACTIVE_STAGES = ['帰国済み', '失踪'];

async function buildTasks() {
  const tasks = [];

  // データ量が多くなると 1件ずつ .get() で問い合わせるのは非常に遅くなる
  // （Tursoはリモート通信のため1回ごとに数十〜数百msかかる）。
  // 必要なテーブルを最初に一括取得し、Mapで引けるようにしておく。
  const [allWorkers, allCompanies, allCases, allVisits, allCompanyRegs, allWorkerRegs, allSendingOrgs] = await Promise.all([
    workers.list(),
    hostCompanies.list(),
    applicationCases.list(),
    visitsAudits.list(),
    companyRegistrations.list(),
    workerRegistrations.list(),
    sendingOrgs.list(),
  ]);
  const workerById = new Map(allWorkers.map((w) => [w.id, w]));
  const companyById = new Map(allCompanies.map((c) => [c.id, c]));

  for (const w of allWorkers) {
    if (INACTIVE_STAGES.includes(w.currentStage)) continue;
    const urgency = getUrgency(getDaysUntil(w.visaExpiryDate));
    if (urgency.level === 'expired' || urgency.level === 'warning') {
      tasks.push({
        id: `worker-visa-${w.id}`,
        category: '在留期限',
        title: `${w.name} の在留期限`,
        dueDate: w.visaExpiryDate,
        level: urgency.level,
        days: urgency.days,
        link: { tab: 'workers', id: w.id },
      });
    }
  }

  for (const c of allCases) {
    if (!c.dueDate || c.status === '認定済み') continue;
    const urgency = getUrgency(getDaysUntil(c.dueDate));
    if (urgency.level === 'expired' || urgency.level === 'warning') {
      const worker = workerById.get(c.workerId);
      tasks.push({
        id: `case-due-${c.id}`,
        category: '認定申請 提出期限',
        title: `${worker ? worker.name : '対象者'} の認定申請`,
        dueDate: c.dueDate,
        level: urgency.level,
        days: urgency.days,
        link: { tab: 'applications', id: c.id },
      });
    }
  }

  for (const v of allVisits) {
    if (v.completedDate) continue;
    const urgency = getUrgency(getDaysUntil(v.scheduledDate), 14);
    if (urgency.level === 'expired' || urgency.level === 'warning') {
      const worker = v.workerId ? workerById.get(v.workerId) : null;
      const company = v.hostCompanyId ? companyById.get(v.hostCompanyId) : null;
      tasks.push({
        id: `visit-${v.id}`,
        category: v.type,
        title: `${company ? company.name : ''}${worker ? ' / ' + worker.name : ''} の${v.type}`,
        dueDate: v.scheduledDate,
        level: urgency.level,
        days: urgency.days,
        link: { tab: 'visits', id: v.id },
      });
    }
  }

  for (const r of allCompanyRegs) {
    if (!r.expiryDate) continue;
    const urgency = getUrgency(getDaysUntil(r.expiryDate));
    if (urgency.level === 'expired' || urgency.level === 'warning') {
      const company = companyById.get(r.hostCompanyId);
      tasks.push({
        id: `company-reg-${r.id}`,
        category: '企業 登録・許認可',
        title: `${company ? company.name : '企業'} の${r.label}`,
        dueDate: r.expiryDate,
        level: urgency.level,
        days: urgency.days,
        link: { tab: 'companies', id: r.hostCompanyId },
      });
    }
  }

  for (const r of allWorkerRegs) {
    if (!r.expiryDate) continue;
    const urgency = getUrgency(getDaysUntil(r.expiryDate));
    if (urgency.level === 'expired' || urgency.level === 'warning') {
      const worker = workerById.get(r.workerId);
      tasks.push({
        id: `worker-reg-${r.id}`,
        category: '対象者 登録・保険',
        title: `${worker ? worker.name : '対象者'} の${r.label}`,
        dueDate: r.expiryDate,
        level: urgency.level,
        days: urgency.days,
        link: { tab: 'workers', id: r.workerId },
      });
    }
  }

  for (const o of allSendingOrgs) {
    if (!o.mouExpiryDate) continue;
    const urgency = getUrgency(getDaysUntil(o.mouExpiryDate));
    if (urgency.level === 'expired' || urgency.level === 'warning') {
      tasks.push({
        id: `sendingorg-mou-${o.id}`,
        category: '送出機関 覚書(MOU)',
        title: `${o.name} の覚書有効期限`,
        dueDate: o.mouExpiryDate,
        level: urgency.level,
        days: urgency.days,
        link: { tab: 'sendingOrgs', id: o.id },
      });
    }
  }

  tasks.sort((a, b) => (a.days ?? 999999) - (b.days ?? 999999));
  return tasks;
}

router.get('/stats', async (req, res) => {
  const [allWorkers, allCompanies, allCases, tasks] = await Promise.all([
    workers.list(),
    hostCompanies.list(),
    applicationCases.list(),
    buildTasks(),
  ]);

  const urgentTasks = tasks.filter((t) => t.level === 'expired' || t.level === 'warning');

  res.json({
    activeWorkers: allWorkers.length,
    hostCompanies: allCompanies.filter((c) => c.status === 'active').length,
    processingCases: allCases.filter((c) => c.status !== '認定済み').length,
    urgentCount: urgentTasks.filter((t) => t.level === 'expired').length,
    warningCount: urgentTasks.filter((t) => t.level === 'warning').length,
  });
});

router.get('/tasks', async (req, res) => {
  res.json(await buildTasks());
});

module.exports = router;
