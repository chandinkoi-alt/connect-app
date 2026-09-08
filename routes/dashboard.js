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
const { getDaysUntil, getUrgency, getWorkerVisaUrgency, isWithinMonths } = require('../lib/dates');
const { getEffectiveExpiryDate } = require('../lib/companyRegistrationExpiry');

const router = express.Router();

// タスクの見出しに企業№・個人連番を添える（一覧画面の番号と対応づけて探しやすくする）。
function workerLabel(worker) {
  if (!worker) return '対象者';
  return worker.personalNo ? `No.${worker.personalNo} ${worker.name}` : worker.name;
}
function companyLabel(company) {
  if (!company) return '企業';
  return company.companyNo ? `No.${company.companyNo} ${company.name}` : company.name;
}

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

  // 在留期限の警告は就労中の対象者のみ（準備中・一時帰国中・帰国済み・失踪は対応不要）。
  // 4ヶ月を切ったら警告、3ヶ月を切ったら危険（lib/dates.js の getWorkerVisaUrgency を参照）。
  for (const w of allWorkers) {
    const urgency = getWorkerVisaUrgency(w);
    if (urgency.level === 'expired' || urgency.level === 'warning') {
      tasks.push({
        id: `worker-visa-${w.id}`,
        category: '在留期限',
        title: `${workerLabel(w)} の在留期限`,
        dueDate: w.visaExpiryDate,
        level: urgency.level,
        days: urgency.days,
        link: { tab: 'workers', id: w.id },
      });
    }
  }

  // 在留期限の5ヶ月前になったら、更新の認定申請案件がまだ無い就労中の対象者に
  // 早めに書類準備を始めるよう知らせる。既に案件（認定済み以外）が作成済みなら
  // 対応が始まっているとみなし、重複して表示しない。
  const workersWithOpenCase = new Set(allCases.filter((c) => c.status !== '認定済み').map((c) => c.workerId));
  for (const w of allWorkers) {
    if (w.currentStage !== '就労中' || workersWithOpenCase.has(w.id)) continue;
    if (!isWithinMonths(w.visaExpiryDate, 5)) continue;
    const days = getDaysUntil(w.visaExpiryDate);
    tasks.push({
      id: `worker-renewal-prep-${w.id}`,
      category: '認定申請 準備',
      title: `${workerLabel(w)} の次回更新書類を準備`,
      dueDate: w.visaExpiryDate,
      level: 'warning',
      days,
      link: { tab: 'workers', id: w.id },
    });
  }

  for (const c of allCases) {
    if (!c.dueDate || c.status === '認定済み') continue;
    const urgency = getUrgency(getDaysUntil(c.dueDate));
    if (urgency.level === 'expired' || urgency.level === 'warning') {
      const worker = workerById.get(c.workerId);
      tasks.push({
        id: `case-due-${c.id}`,
        category: '認定申請 提出期限',
        title: `${workerLabel(worker)} の認定申請`,
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
        title: `${company ? companyLabel(company) : ''}${worker ? ' / ' + workerLabel(worker) : ''} の${v.type}`,
        dueDate: v.scheduledDate,
        level: urgency.level,
        days: urgency.days,
        link: { tab: 'visits', id: v.id },
      });
    }
  }

  for (const r of allCompanyRegs) {
    const expiryDate = getEffectiveExpiryDate(r);
    if (!expiryDate) continue;
    const urgency = getUrgency(getDaysUntil(expiryDate));
    if (urgency.level === 'expired' || urgency.level === 'warning') {
      const company = companyById.get(r.hostCompanyId);
      tasks.push({
        id: `company-reg-${r.id}`,
        category: '企業 登録・許認可',
        title: `${companyLabel(company)} の${r.label}`,
        dueDate: expiryDate,
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
        title: `${workerLabel(worker)} の${r.label}`,
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
