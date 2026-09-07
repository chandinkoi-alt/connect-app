const express = require('express');
const { billingRates } = require('../db');

const router = express.Router();

const VISA_TYPES = ['技能実習1号', '技能実習2号', '技能実習3号', '育成就労', '特定技能1号', '特定技能2号'];

// 全在留資格を返す。金額未設定のものは0円として返す
router.get('/rates', async (req, res) => {
  const rows = await billingRates.list();
  const map = Object.fromEntries(rows.map((r) => [r.visaType, r.monthlyFee]));
  res.json(VISA_TYPES.map((visaType) => ({ visaType, monthlyFee: map[visaType] || 0 })));
});

router.put('/rates/:visaType', async (req, res) => {
  const { visaType } = req.params;
  if (!VISA_TYPES.includes(visaType)) {
    return res.status(400).json({ error: '不正な在留資格です。' });
  }
  const monthlyFee = Number(req.body.monthlyFee) || 0;
  const updated = await billingRates.upsert(visaType, monthlyFee);
  res.json(updated);
});

module.exports = router;
