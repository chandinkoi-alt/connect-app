const express = require('express');
const { sendingOrgs } = require('../db');

const router = express.Router();

function buildRecord(body) {
  return {
    name: (body.name || '').trim(),
    country: (body.country || '').trim(),
    licenseNumber: (body.licenseNumber || '').trim(),
    contactPerson: (body.contactPerson || '').trim(),
    contactPhone: (body.contactPhone || '').trim(),
    contactEmail: (body.contactEmail || '').trim(),
    notes: (body.notes || '').trim(),
  };
}

router.get('/', async (req, res) => {
  res.json(await sendingOrgs.list());
});

router.get('/:id', async (req, res) => {
  const org = await sendingOrgs.get(Number(req.params.id));
  if (!org) return res.status(404).json({ error: '送出機関が見つかりません。' });
  res.json(org);
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
