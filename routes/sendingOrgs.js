const express = require('express');
const { sendingOrgs, workers, hostCompanies } = require('../db');
const { getDaysUntil, getUrgency } = require('../lib/dates');

const router = express.Router();

const STAGE_BREAKDOWN_KEYS = ['準備中', '就労中', '一時帰国中', '帰国済み', '失踪'];

function buildRecord(body) {
  return {
    name: (body.name || '').trim(),
    country: (body.country || '').trim(),
    licenseNumber: (body.licenseNumber || '').trim(),
    contactPerson: (body.contactPerson || '').trim(),
    contactPhone: (body.contactPhone || '').trim(),
    contactEmail: (body.contactEmail || '').trim(),
    address: (body.address || '').trim(),
    representativeName: (body.representativeName || '').trim(),
    authorizationNumber: (body.authorizationNumber || '').trim(),
    mouSignedDate: body.mouSignedDate || '',
    mouExpiryDate: body.mouExpiryDate || '',
    notes: (body.notes || '').trim(),
  };
}

function enrichOrg(org, orgWorkers) {
  const byStage = {};
  for (const key of STAGE_BREAKDOWN_KEYS) byStage[key] = 0;
  for (const w of orgWorkers) {
    if (byStage[w.currentStage] !== undefined) byStage[w.currentStage]++;
  }
  return {
    ...org,
    totalWorkers: orgWorkers.length,
    activeWorkers: orgWorkers.filter((w) => !['帰国済み', '失踪'].includes(w.currentStage)).length,
    byStage,
    trainingCount: byStage['就労中'],
    waitingCount: byStage['準備中'],
    mouStatus: getUrgency(getDaysUntil(org.mouExpiryDate)),
  };
}

router.get('/', async (req, res) => {
  const [orgs, allWorkers] = await Promise.all([sendingOrgs.list(), workers.list()]);
  const workersByOrgId = new Map();
  for (const w of allWorkers) {
    if (!w.sendingOrgId) continue;
    if (!workersByOrgId.has(w.sendingOrgId)) workersByOrgId.set(w.sendingOrgId, []);
    workersByOrgId.get(w.sendingOrgId).push(w);
  }
  const enriched = orgs.map((org) => enrichOrg(org, workersByOrgId.get(org.id) || []));
  res.json(enriched);
});

router.get('/:id', async (req, res) => {
  const org = await sendingOrgs.get(Number(req.params.id));
  if (!org) return res.status(404).json({ error: '送出機関が見つかりません。' });
  const allWorkers = await workers.list();
  const orgWorkers = allWorkers.filter((w) => w.sendingOrgId === org.id);
  res.json(enrichOrg(org, orgWorkers));
});

// プロフィール表示用: この送出機関に所属する対象者一覧（企業名付き）
router.get('/:id/workers', async (req, res) => {
  const id = Number(req.params.id);
  if (!(await sendingOrgs.get(id))) return res.status(404).json({ error: '送出機関が見つかりません。' });
  const [allWorkers, allCompanies] = await Promise.all([workers.list(), hostCompanies.list()]);
  const companyById = new Map(allCompanies.map((c) => [c.id, c]));
  const orgWorkers = allWorkers
    .filter((w) => w.sendingOrgId === id)
    .map((w) => ({
      id: w.id,
      name: w.name,
      currentStage: w.currentStage,
      visaExpiryDate: w.visaExpiryDate,
      visaStatus: getUrgency(getDaysUntil(w.visaExpiryDate)),
      companyName: w.hostCompanyId && companyById.has(w.hostCompanyId) ? companyById.get(w.hostCompanyId).name : '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json(orgWorkers);
});

router.post('/', async (req, res) => {
  if (!req.body.name || !req.body.name.trim()) {
    return res.status(400).json({ errors: ['名称は必須です。'] });
  }
  res.status(201).json(await sendingOrgs.insert(buildRecord(req.body)));
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!(await sendingOrgs.get(id))) return res.status(404).json({ error: '送出機関が見つかりません。' });
  if (!req.body.name || !req.body.name.trim()) {
    return res.status(400).json({ errors: ['名称は必須です。'] });
  }
  res.json(await sendingOrgs.update(id, buildRecord(req.body)));
});

router.delete('/:id', async (req, res) => {
  const deleted = await sendingOrgs.remove(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: '送出機関が見つかりません。' });
  res.json({ ok: true });
});

module.exports = router;
