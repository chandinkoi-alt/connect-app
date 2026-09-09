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

async function generateNinteiPdf(data) {
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

module.exports = { generateNinteiPdf };
