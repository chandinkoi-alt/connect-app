// 既にインポート済みの受入企業・対象者に対して、後から追加された項目
// （企業№・個人連番・退会状態・失踪状態）だけを名前で照合して補完する。
// 通常のインポート（lib/excelImport.js の startImport）とは異なり、新規レコードは
// 一切作成せず、既存レコードの一部フィールドのみを更新するため、同じExcelファイルで
// 何度実行してもデータが重複しない。
const ExcelJS = require('exceljs');
const { hostCompanies, workers } = require('../db');

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

async function runBackfill(buffer, summary) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const companySheet = workbook.getWorksheet(COMPANY_SHEET);
  const workerSheet = workbook.getWorksheet(WORKER_SHEET);
  if (!companySheet || !workerSheet) {
    throw new Error(`必要なシート（${COMPANY_SHEET} / ${WORKER_SHEET}）が見つかりません。`);
  }

  // ---------- 1. 受入企業: 名前で照合し、企業№・在籍状態を補完 ----------
  const existingCompanies = await hostCompanies.list();
  const companyByName = new Map(existingCompanies.map((c) => [c.name, c]));
  const companyNoToId = new Map(); // Excelの企業№ → DBのid（対象者の紐付けに使う）

  for (let r = 3; r <= companySheet.rowCount; r++) {
    const row = companySheet.getRow(r);
    const no = cell(row, 1);
    const name = toText(cell(row, 2));
    if (!no || !name) continue;

    const existing = companyByName.get(name);
    if (!existing) {
      summary.companiesNotFound++;
      continue;
    }
    companyNoToId.set(Number(no), existing.id);
    try {
      const membershipStatus = toText(cell(row, 13));
      const status = membershipStatus === '退会' ? 'withdrawn' : existing.status === 'lead' ? existing.status : 'active';
      await hostCompanies.update(existing.id, { ...existing, companyNo: Number(no), status });
      summary.companiesMatched++;
    } catch (err) {
      summary.errors.push(`受入企業「${name}」の補完に失敗: ${err.message}`);
    }
  }

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

  for (let r = 4; r <= workerSheet.rowCount; r++) {
    const row = workerSheet.getRow(r);
    const name = toText(cell(row, 6));
    const personalNo = cell(row, 4);
    const companyNo = cell(row, 1);
    if (!name || !personalNo) continue;

    const dob = toDateStr(cell(row, 7));
    const hostCompanyId = companyNo ? companyNoToId.get(Number(companyNo)) || null : null;
    const compositeKey = `${name}|${dob}|${hostCompanyId}`;

    let existing = workerByCompositeKey.get(compositeKey);
    if (!existing) {
      // 企業が特定できない、または一致しない場合は氏名＋生年月日でフォールバック
      // （候補が1件だけなら確定、複数あれば同姓同名で判別不能のためスキップする）
      const candidates = workerByNameDob.get(`${name}|${dob}`) || [];
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
      const leaveReason = toText(cell(row, 26));
      const currentStage = leaveReason === '失踪' ? '失踪' : existing.currentStage;
      await workers.update(existing.id, { ...existing, personalNo: Number(personalNo), currentStage });
      summary.workersMatched++;
    } catch (err) {
      summary.errors.push(`対象者「${name}」の補完に失敗: ${err.message}`);
    }
  }
}

module.exports = { startBackfill };
