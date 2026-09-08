const express = require('express');
const multer = require('multer');
const { startImport } = require('../lib/excelImport');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// 既存のExcel管理台帳（受入企業データ・監理外国人名簿）を一括インポートする（一回限りの移行用）。
// ログイン済みユーザーのみ利用可能（server.js の requireAuth 配下にマウント）。
//
// Turso（リモートDB）への大量書き込みは数十秒〜数分かかることがあり、1つのHTTPリクエスト
// 内で完結させようとするとタイムアウトしてしまう。そのためアップロードは即座に受理して
// バックグラウンドで処理を進め、進捗・結果は別エンドポイントでポーリングする。
//
// 注: 以前は処理を worker_threads で完全に別スレッド実行していたが、新しいV8インスタンスを
// 立ち上げる分メモリを二重に消費し、メモリの少ない環境（Renderの無料枠など）でOOMを
// 引き起こしたため、通常のPromiseベースの非同期処理に戻した。DB書き込みはI/O待ちが
// 大半でその都度イベントループに制御が戻るため、サーバー全体が完全に固まることはない。
let currentJob = null;

router.post('/excel', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ファイルが選択されていません。' });
  if (currentJob && currentJob.status === 'running') {
    return res.status(409).json({ error: '別のインポート処理が実行中です。完了までお待ちください。' });
  }

  const { summary, promise } = startImport(req.file.buffer);
  currentJob = { status: 'running', summary, error: null };
  promise
    .then(() => {
      currentJob.status = 'done';
    })
    .catch((err) => {
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
