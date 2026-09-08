// Excel一括インポートを別スレッド（worker_threads）で実行するエントリポイント。
// ExcelJSの解析や大量のDB書き込みはCPU/待機時間を要するため、メインのExpressイベント
// ループ上で直接実行すると、その間サーバー全体（他のAPIリクエストやポーリング）が
// 応答できなくなる恐れがある。worker_threadsで完全に切り離して実行する。
const { parentPort, workerData } = require('worker_threads');
const { ready } = require('../db');
const { startImport } = require('./excelImport');

async function main() {
  await ready;

  const buffer = Buffer.from(workerData.buffer);
  const { summary, promise } = startImport(buffer);

  const interval = setInterval(() => {
    parentPort.postMessage({ type: 'progress', summary });
  }, 1000);

  try {
    await promise;
    clearInterval(interval);
    parentPort.postMessage({ type: 'done', summary });
  } catch (err) {
    clearInterval(interval);
    parentPort.postMessage({ type: 'error', summary, error: err.message });
  }
}

main().catch((err) => {
  parentPort.postMessage({ type: 'error', summary: null, error: err.message });
});
