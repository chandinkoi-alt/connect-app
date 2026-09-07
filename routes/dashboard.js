const express = require('express');
const { workers, hostCompanies, applicationCases, visitsAudits } = require('../db');
const { getDaysUntil, getUrgency } = require('../lib/dates');

const router = express.Router();

router.get('/stats', (req, res) => {
  const allWorkers = workers.list();
  const allCompanies = hostCompanies.list();
  const allCases = applicationCases.list();

  const urgentTasks = buildTasks().filter((t) => t.level === 'expired' || t.level === 'warning');

  res.json({
    activeWorkers: allWorkers.length,
    hostCompanies: allCompanies.filter((c) => c.status === 'active').length,
    processingCases: allCases.filter((c) => c.status !== '認定済み').length,
    urgentCount: urgentTasks.filter((t) => t.level === 'expired').length,
    warningCount: urgentTasks.filter((t) => t.level === 'warning').length,
  });
});

function buildTasks() {
  const tasks = [];

  workers.list().forEach((w) => {
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
  });

  applicationCases.list().forEach((c) => {
    if (!c.dueDate || c.status === '認定済み') return;
    const urgency = getUrgency(getDaysUntil(c.dueDate));
    if (urgency.level === 'expired' || urgency.level === 'warning') {
      const worker = workers.get(c.workerId);
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
  });

  visitsAudits.list().forEach((v) => {
    if (v.completedDate) return;
    const urgency = getUrgency(getDaysUntil(v.scheduledDate), 14);
    if (urgency.level === 'expired' || urgency.level === 'warning') {
      const worker = v.workerId ? workers.get(v.workerId) : null;
      const company = v.hostCompanyId ? hostCompanies.get(v.hostCompanyId) : null;
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
  });

  tasks.sort((a, b) => (a.days ?? 999999) - (b.days ?? 999999));
  return tasks;
}

router.get('/tasks', (req, res) => {
  res.json(buildTasks());
});

module.exports = router;
