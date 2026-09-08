// 既にインポート済みの受入企業・対象者に対して、後から追加された項目
// （企業№・個人連番・退会状態・失踪状態）だけを名前で照合して補完する。
// 通常のインポート（lib/excelImport.js の startImport）とは異なり、新規レコードは
// 一切作成せず、既存レコードの一部フィールドのみを更新するため、同じExcelファイルで
// 何度実行してもデータが重複しない。
const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const { hostCompanies, workers } = require('../db');
const { stripPhoneticHints } = require('./xlsxPhoneticFix');

const COMPANY_SHEET = '受入企業データ';
const WORKER_SHEET = '監理外国人名簿';

function unwrapCellValue(v) {
  if (v && typeof v === 'object' && !(v instanceof Date) && !v.richText && !v.hyperlink) {
    if ('result' in v) return v.result === undefined ? null : v.result;
    return null;
  }
  return v;
}
function cell(row, col) {
  const c = row.getCell(col);
  const raw = c && c.value !== undefined ? c.value : null;
  return unwrapCellValue(raw);
}
function toText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v.text) return String(v.text).trim();
  if (typeof v === 'object' && v.richText) return v.richText.map((t) => t.text).join('').trim();
  return String(v).trim();
}
function toDateStr(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const y = v.getFullYear();
    if (y < 1950) return '';
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    const utcDays = Math.floor(v - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    if (!Number.isNaN(date.getTime())) return toDateStr(date);
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) return v.trim().slice(0, 10);
  return '';
}

function startBackfill(buffer) {
  const summary = {
    companiesMatched: 0,
    companiesNotFound: 0,
    workersMatched: 0,
    workersNotFound: 0,
    workersAmbiguous: 0,
    errors: [],
  };
  const promise = runBackfill(buffer, summary);
  return { summary, promise };
}

function logMemory(label) {
  const m = process.memoryUsage();
  console.log(
    `[excelBackfill] ${label}: rss=${(m.rss / 1024 / 1024).toFixed(1)}MB heapUsed=${(m.heapUsed / 1024 / 1024).toFixed(1)}MB external=${(m.external / 1024 / 1024).toFixed(1)}MB`
  );
}

// workbook.xlsx.load()（通常読み込み）はメモリを大量に消費するため、ストリーミング解析を
// 使う（lib/excelImport.js と同様。ふりがな不具合の回避も含め詳細は lib/xlsxPhoneticFix.js）。
async function streamExtractRows(buffer) {
  const fixedBuffer = await stripPhoneticHints(buffer);

  const companyRows = [];
  const workerRows = [];
  let foundCompanySheet = false;
  let foundWorkerSheet = false;

  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(fixedBuffer), {
    worksheets: 'emit',
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore',
    entries: 'ignore',
  });

  workbookReader.on('worksheet', (worksheetReader) => {
    if (worksheetReader.name === COMPANY_SHEET) {
      foundCompanySheet = true;
      worksheetReader.on('row', (row) => {
        if (row.number < 3) return;
        const no = cell(row, 1);
        const name = toText(cell(row, 2));
        if (!no || !name) return;
        companyRows.push({ no: Number(no), name, membershipStatus: toText(cell(row, 13)) });
      });
    } else if (worksheetReader.name === WORKER_SHEET) {
      foundWorkerSheet = true;
      worksheetReader.on('row', (row) => {
        if (row.number < 4) return;
        const name = toText(cell(row, 6));
        const personalNo = cell(row, 4);
        if (!name || !personalNo) return;
        workerRows.push({
          name,
          personalNo: Number(personalNo),
          companyNo: cell(row, 1) ? Number(cell(row, 1)) : null,
          dob: toDateStr(cell(row, 7)),
          leaveReason: toText(cell(row, 26)),
        });
      });
    }
  });

  await workbookReader.read();

  if (!foundCompanySheet || !foundWorkerSheet) {
    throw new Error(`必要なシート（${COMPANY_SHEET} / ${WORKER_SHEET}）が見つかりません。`);
  }

  return { companyRows, workerRows };
}

async function runBackfill(buffer, summary) {
  logMemory('開始時');
  const { companyRows, workerRows } = await streamExtractRows(buffer);
  logMemory('Excel解析完了');

  // ---------- 1. 受入企業: 名前で照合し、企業№・在籍状態を補完 ----------
  const existingCompanies = await hostCompanies.list();
  const companyByName = new Map(existingCompanies.map((c) => [c.name, c]));
  const companyNoToId = new Map(); // Excelの企業№ → DBのid（対象者の紐付けに使う）

  for (const row of companyRows) {
    const existing = companyByName.get(row.name);
    if (!existing) {
      summary.companiesNotFound++;
      continue;
    }
    companyNoToId.set(row.no, existing.id);
    try {
      const status = row.membershipStatus === '退会' ? 'withdrawn' : existing.status === 'lead' ? existing.status : 'active';
      await hostCompanies.update(existing.id, { ...existing, companyNo: row.no, status });
      summary.companiesMatched++;
    } catch (err) {
      summary.errors.push(`受入企業「${row.name}」の補完に失敗: ${err.message}`);
    }
  }
  logMemory('受入企業 補完完了');

  // ---------- 2. 対象者: 氏名だけでは同姓同名（転籍による再登録等）で誤認識するため、
  //             氏名＋生年月日＋所属企業（Excel上の企業№から解決）を複合キーとして照合する ----------
  const existingWorkers = await workers.list();
  const workerByCompositeKey = new Map();
  const workerByNameDob = new Map(); // 会社が不明な場合のフォールバック照合用
  for (const w of existingWorkers) {
    const key = `${w.name}|${w.dob}|${w.hostCompanyId}`;
    workerByCompositeKey.set(key, w);
    const nameDobKey = `${w.name}|${w.dob}`;
    if (!workerByNameDob.has(nameDobKey)) workerByNameDob.set(nameDobKey, []);
    workerByNameDob.get(nameDobKey).push(w);
  }

  for (const row of workerRows) {
    const hostCompanyId = row.companyNo ? companyNoToId.get(row.companyNo) || null : null;
    const compositeKey = `${row.name}|${row.dob}|${hostCompanyId}`;

    let existing = workerByCompositeKey.get(compositeKey);
    if (!existing) {
      // 企業が特定できない、または一致しない場合は氏名＋生年月日でフォールバック
      // （候補が1件だけなら確定、複数あれば同姓同名で判別不能のためスキップする）
      const candidates = workerByNameDob.get(`${row.name}|${row.dob}`) || [];
      if (candidates.length === 1) existing = candidates[0];
      else if (candidates.length > 1) {
        summary.workersAmbiguous++;
        continue;
      }
    }
    if (!existing) {
      summary.workersNotFound++;
      continue;
    }
    try {
      const currentStage = row.leaveReason === '失踪' ? '失踪' : existing.currentStage;
      await workers.update(existing.id, { ...existing, personalNo: row.personalNo, currentStage });
      summary.workersMatched++;
    } catch (err) {
      summary.errors.push(`対象者「${row.name}」の補完に失敗: ${err.message}`);
    }
  }
  logMemory('完了時');
}

module.exports = { startBackfill };
