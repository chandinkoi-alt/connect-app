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

router.get('/', (req, res) => {
  res.json(sendingOrgs.list());
});

router.get('/:id', (req, res) => {
  const org = sendingOrgs.get(Number(req.params.id));
  if (!org) return res.status(404).json({ error: '送出機関が見つかりません。' });
  res.json(org);
});

router.post('/', (req, res) => {
  if (!req.body.name || !req.body.name.trim()) {
    return res.status(400).json({ errors: ['名称は必須です。'] });
  }
  res.status(201).json(sendingOrgs.insert(buildRecord(req.body)));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!sendingOrgs.get(id)) return res.status(404).json({ error: '送出機関が見つかりません。' });
  if (!req.body.name || !req.body.name.trim()) {
    return res.status(400).json({ errors: ['名称は必須です。'] });
  }
  res.json(sendingOrgs.update(id, buildRecord(req.body)));
});

router.delete('/:id', (req, res) => {
  const deleted = sendingOrgs.remove(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: '送出機関が見つかりません。' });
  res.json({ ok: true });
});

module.exports = router;
