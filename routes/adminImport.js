const express = require('express');
const multer = require('multer');
const path = require('path');
const { Worker } = require('worker_threads');
const { client } = require('../db');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// 既存のExcel管理台帳（受入企業データ・監理外国人名簿）を一括インポート／補完する
// （一回限りの移行用）。ログイン済みユーザーのみ利用可能（server.js の requireAuth 配下）。
//
// 実際の処理（Excel解析＋Turso remoteへの大量書き込み）はCPU・メモリの両方を要する
// 重い処理であり、メモリの少ない環境（Renderの無料枠など）ではメモリ上限に達して
// 失敗することがある。worker_threads で別スレッド実行することで、その失敗が発生しても
// メインのExpressサーバー本体（ログイン・他画面・進捗ポーリング自体）が道連れにならず、
// 通常どおり応答し続けられる。
let currentJob = null;

function startJob(mode, buffer) {
  currentJob = { status: 'running', mode, summary: null, error: null };

  const worker = new Worker(path.join(__dirname, '../lib/importWorkerEntry.js'), {
    workerData: { buffer, mode },
    // worker_threads のデフォルトのヒープ上限は、コンテナのメモリ制限から自動計算される際に
    // 想定より小さくなることがある。ここで明示的に十分な上限を指定し、実際のメモリ使用量
    // （数十MB程度）に対して不必要に低い上限で失敗しないようにする。
    resourceLimits: {
      maxOldGenerationSizeMb: 350,
      maxYoungGenerationSizeMb: 64,
    },
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
  worker.on('exit', (code) => {
    if (code !== 0 && currentJob.status === 'running') {
      currentJob.status = 'error';
      currentJob.error = `処理が予期せず終了しました（メモリ不足の可能性があります。exit code ${code}）。`;
    }
  });
}

router.post('/excel', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ファイルが選択されていません。' });
  if (currentJob && currentJob.status === 'running') {
    return res.status(409).json({ error: '別の処理が実行中です。完了までお待ちください。' });
  }
  startJob('import', req.file.buffer);
  res.json({ status: 'started' });
});

// 既にインポート済みのデータに対して、企業№・個人連番・退会/失踪状態だけを
// 名前で照合して補完する（新規レコードは作らないため、何度実行しても重複しない）。
router.post('/backfill', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ファイルが選択されていません。' });
  if (currentJob && currentJob.status === 'running') {
    return res.status(409).json({ error: '別の処理が実行中です。完了までお待ちください。' });
  }
  startJob('backfill', req.file.buffer);
  res.json({ status: 'started' });
});

router.get('/status', (req, res) => {
  if (!currentJob) return res.json({ status: 'idle' });
  res.json(currentJob);
});

// アプリ障害・誤操作・Turso側の事故に備えた、全データのバックアップ用ダウンロード。
// テーブル一覧はハードコードせずsqlite_masterから動的に取得する（新しいテーブルが
// 増えても追随できるようにするため）。usersのpasswordHashだけは、バックアップ
// ファイルが外部に漏れた場合の被害を最小化するため含めない（復元時は各自パスワード
// 再設定が必要）。
router.get('/backup', async (req, res) => {
  try {
    const tablesRs = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    const tables = {};
    for (const { name } of tablesRs.rows) {
      const rs = await client.execute(`SELECT * FROM ${name}`);
      tables[name] = rs.rows.map((row) => {
        const plain = { ...row };
        if (name === 'users') delete plain.passwordHash;
        return plain;
      });
    }

    const payload = { exportedAt: new Date().toISOString(), tables };
    const filename = `connect-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    res.status(500).json({ error: 'バックアップの作成に失敗しました: ' + err.message });
  }
});

module.exports = router;
