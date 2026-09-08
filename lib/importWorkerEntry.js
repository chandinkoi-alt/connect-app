// Excel一括インポートを別スレッド（worker_threads）で実行するエントリポイント。
// この処理はメモリ使用量が大きく（Excel全体をメモリ上のオブジェクトモデルとして展開する
// ため）、メモリの少ない環境ではメモリ上限に達して失敗することがある。別スレッドで
// 実行することで、その失敗が発生してもメインのExpressサーバー本体は道連れにならず、
// 通常どおり応答し続けられる（失敗時は currentJob に error として記録され、
// ユーザーにはエラーメッセージとして表示される）。
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
