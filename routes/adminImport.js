const express = require('express');
const multer = require('multer');
const { importWorkbook } = require('../lib/excelImport');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// 既存のExcel管理台帳（受入企業データ・監理外国人名簿）を一括インポートする（一回限りの移行用）。
// ログイン済みユーザーのみ利用可能（server.js の requireAuth 配下にマウント）。
router.post('/excel', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ファイルが選択されていません。' });
  try {
    const summary = await importWorkbook(req.file.buffer);
    res.json(summary);
  } catch (err) {
    res.status(400).json({ error: `インポートに失敗しました: ${err.message}` });
  }
});

module.exports = router;
