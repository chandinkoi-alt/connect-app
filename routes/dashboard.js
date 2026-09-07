const express = require('express');
const { workers, hostCompanies, applicationCases, visitsAudits } = require('../db');
const { getDaysUntil, getUrgency } = require('../lib/dates');

const router = express.Router();

async function buildTasks() {
  const tasks = [];

  const allWorkers = await workers.list();
  for (const w of allWorkers) {
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

  const allCases = await applicationCases.list();
  for (const c of allCases) {
    if (!c.dueDate || c.status === '認定済み') continue;
    const urgency = getUrgency(getDaysUntil(c.dueDate));
    if (urgency.level === 'expired' || urgency.level === 'warning') {
      const worker = await workers.get(c.workerId);
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

  const allVisits = await visitsAudits.list();
  for (const v of allVisits) {
    if (v.completedDate) continue;
    const urgency = getUrgency(getDaysUntil(v.scheduledDate), 14);
    if (urgency.level === 'expired' || urgency.level === 'warning') {
      const worker = v.workerId ? await workers.get(v.workerId) : null;
      const company = v.hostCompanyId ? await hostCompanies.get(v.hostCompanyId) : null;
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

  tasks.sort((a, b) => (a.days ?? 999999) - (b.days ?? 999999));
  return tasks;
}

router.get('/stats', async (req, res) => {
  const allWorkers = await workers.list();
  const allCompanies = await hostCompanies.list();
  const allCases = await applicationCases.list();

  const urgentTasks = (await buildTasks()).filter((t) => t.level === 'expired' || t.level === 'warning');

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
