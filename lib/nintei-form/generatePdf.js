// 技能実習計画認定申請書（別記様式第１号）の実物Word様式にデータを書き込み、
// LibreOffice headlessでPDFに変換する。fill_form.py（python-docx）と
// soffice（LibreOffice）を子プロセスとして呼び出す。
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const FILL_SCRIPT = path.join(__dirname, 'fill_form.py');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', (err) => reject(new Error(`${cmd}の実行に失敗しました: ${err.message}`)));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd}がエラー終了しました（code ${code}）: ${stderr.trim()}`));
    });
  });
}

async function generateNinteiPdfOnce(data) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nintei-'));
  try {
    const jsonPath = path.join(tmpDir, 'data.json');
    const docxPath = path.join(tmpDir, 'form.docx');
    await fs.promises.writeFile(jsonPath, JSON.stringify(data), 'utf-8');
    await run('python3', [FILL_SCRIPT, jsonPath, docxPath]);
    await run('soffice', [
      '--headless',
      `-env:UserInstallation=file://${tmpDir}/lo-profile`,
      '--convert-to', 'pdf',
      '--outdir', tmpDir,
      docxPath,
    ]);
    return await fs.promises.readFile(path.join(tmpDir, 'form.pdf'));
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

// LibreOfficeは1回の変換でも十分にメモリを使う（実測で200MB超）ため、
// 複数人が同時に「PDF出力」を押すと soffice プロセスが並行して立ち上がり、
// メモリが少ない環境（Renderの無料枠など）でOOMになりかねない。
// キューで直列化し、常に1件ずつしか実行しないようにする（同時に押された分は
// 順番待ちになるだけで、それぞれの結果は正しく呼び出し元に返る）。
let queueTail = Promise.resolve();

function generateNinteiPdf(data) {
  const runThis = () => generateNinteiPdfOnce(data);
  const result = queueTail.then(runThis, runThis);
  queueTail = result.then(() => {}, () => {});
  return result;
}

module.exports = { generateNinteiPdf };
