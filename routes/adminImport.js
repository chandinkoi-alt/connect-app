const express = require('express');
const multer = require('multer');
const path = require('path');
const { Worker } = require('worker_threads');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// 既存のExcel管理台帳（受入企業データ・監理外国人名簿）を一括インポートする（一回限りの移行用）。
// ログイン済みユーザーのみ利用可能（server.js の requireAuth 配下にマウント）。
//
// 実際の取り込み処理（Excel解析＋Turso remoteへの大量書き込み）はCPUと待機時間の両方を
// 要するため、worker_threads で完全に別スレッド実行する。こうすることで処理中も
// サーバー本体（ログイン・他の画面・進捗ポーリング自体）が固まらず応答し続けられる。
let currentJob = null;

router.post('/excel', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ファイルが選択されていません。' });
  if (currentJob && currentJob.status === 'running') {
    return res.status(409).json({ error: '別のインポート処理が実行中です。完了までお待ちください。' });
  }

  currentJob = { status: 'running', summary: null, error: null };

  const worker = new Worker(path.join(__dirname, '../lib/importWorkerEntry.js'), {
    workerData: { buffer: req.file.buffer },
  });

  worker.on('message', (msg) => {
    currentJob.summary = msg.summary;
    if (msg.type === 'done') currentJob.status = 'done';
    if (msg.type === 'error') {
      currentJob.status = 'error';
      currentJob.error = msg.error;
    }
  });
  worker.on('error', (err) => {
    currentJob.status = 'error';
    currentJob.error = err.message;
  });

  res.json({ status: 'started' });
});

router.get('/status', (req, res) => {
  if (!currentJob) return res.json({ status: 'idle' });
  res.json(currentJob);
});

module.exports = router;
