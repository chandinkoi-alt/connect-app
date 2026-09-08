// 既存のExcel管理台帳（受入企業データ / 監理外国人名簿 / 監理外国人名簿(2)）を
// データベースへ一括取り込みするための変換ロジック。
const ExcelJS = require('exceljs');
const {
  hostCompanies,
  companyRegistrations,
  workers,
  workerRegistrations,
  sendingOrgs,
  applicationCases,
  visitsAudits,
} = require('../db');
const { buildSpecialHealthChecks } = require('./healthChecks');
const { buildChecklist } = require('./checklists');

const COMPANY_SHEET = '受入企業データ';
const WORKER_SHEET = '監理外国人名簿';
const WORKER_SHEET_2 = '監理外国人名簿 (2)';
const MANAGING_ORG_FILTER = 'ｺﾈｸﾄ'; // このシステムはコネクト協同組合専用のため、他団体が管理する記録は取り込まない

// このワークブックは数式セル（他シート参照・共有数式）が多用されている。
// ExcelJSは数式セルを {formula, result} または {sharedFormula, result} で返すため、
// ここで先に「計算済みの値」だけを取り出しておく（キャッシュされた結果が無い場合は null）。
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
  if (v instanceof Date) return toDateStr(v);
  return String(v).trim();
}

// 日付専用セル向け: Dateオブジェクト、またはYYYY-MM-DD形式の文字列のみを日付として扱う。
// 「無」「未定」などのプレースホルダー文字が日付欄に紛れ込んでいるケースがあるため、
// それらは意図的に空文字として扱う（提出日なし＝未提出、という意味になる）。
function toDateStr(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const y = v.getFullYear();
    // 日付書式のセルが空・0値の場合、ExcelはUnixではなく1899-12-30を返すことがある。
    // これは「値なし」を意味するため、実在しない日付として除外する。
    if (y < 1950) return '';
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // ストリーミング解析（メモリ節約のためスタイル情報を読み込んでいない）では、
  // 日付書式のセルもDateオブジェクトへ自動変換されず、生のExcelシリアル値
  // （1899-12-30を起点とした日数）のまま渡ってくる。ここでDateに変換する。
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    const utcDays = Math.floor(v - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    if (!Number.isNaN(date.getTime())) return toDateStr(date);
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) return v.trim().slice(0, 10);
  return '';
}

function mapVisaType(statusType, visaStageRaw) {
  const raw = toText(visaStageRaw);
  if (statusType === '特定技能') return '特定技能1号';
  if (raw.includes('３号') || raw.includes('3号')) return '技能実習3号';
  if (raw.includes('２号') || raw.includes('2号')) return '技能実習2号';
  if (raw.includes('１号') || raw.includes('1号')) return '技能実習1号';
  return '技能実習1号';
}

function mapStatusType(raw) {
  const t = toText(raw);
  if (t === '特定') return '特定技能';
  return '技能実習';
}

function mapCurrentStage(raw) {
  const t = toText(raw);
  if (t === '終') return '帰国済み';
  if (t === '未') return '準備中';
  if (t === '在') return '就労中';
  return '';
}

// Turso（リモートDB）は1件ごとの通信に時間がかかるため、直列実行だと数百〜千件規模で
// 数分かかりHTTPタイムアウトの原因になる。ある程度並列に処理して短縮する。
async function mapWithConcurrency(items, limit, fn) {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const current = idx++;
      await fn(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// ---------- 行データの抽出（ストリーミング中、行がまだ生きている間に呼ぶ） ----------
// ExcelJSの Workbook.xlsx.load() は全シートを丸ごとメモリ上のオブジェクトモデルとして
// 保持するため、行数の多いファイルではメモリを大量に消費する（メモリの少ない環境では
// OOMの原因になる）。ここでは WorkbookReader によるストリーミング解析を使い、行ごとに
// 必要な値だけをプレーンなオブジェクトへ抽出してすぐに手放す（ExcelJSの行・セル
// オブジェクト自体はその後ガベージコレクションされる）。

function extractCompanyData(row) {
  const no = cell(row, 1);
  const name = toText(cell(row, 2));
  if (!no || !name) return null;

  const postal1 = toText(cell(row, 4));
  const addressRaw = toText(cell(row, 5));
  const address = postal1 ? `〒${postal1} ${addressRaw}` : addressRaw;

  const dorm2 = toText(cell(row, 29));
  const dorm3 = toText(cell(row, 31));
  const emerg1Name = toText(cell(row, 32));
  const emerg1Tel = toText(cell(row, 33));
  const emerg2Name = toText(cell(row, 34));
  const emerg2Tel = toText(cell(row, 35));
  const emerg3Name = toText(cell(row, 36));
  const emerg3Tel = toText(cell(row, 37));
  const payDate = toText(cell(row, 22));

  const notesParts = [];
  if (payDate) notesParts.push(`給与締支払日: ${payDate}`);
  if (dorm2) notesParts.push(`寮住所②: ${dorm2}`);
  if (dorm3) notesParts.push(`寮住所③: ${dorm3}`);
  if (emerg1Name || emerg1Tel) notesParts.push(`緊急連絡先1: ${emerg1Name} ${emerg1Tel}`);
  if (emerg2Name || emerg2Tel) notesParts.push(`緊急連絡先2: ${emerg2Name} ${emerg2Tel}`);
  if (emerg3Name || emerg3Tel) notesParts.push(`緊急連絡先3: ${emerg3Name} ${emerg3Tel}`);

  // 列13「在籍有無」に「退会」とある場合は、コネクトとの取引を終えた企業を意味する。
  const membershipStatus = toText(cell(row, 13));
  const status = membershipStatus === '退会' ? 'withdrawn' : 'active';

  return {
    no: Number(no),
    name,
    insertData: {
      companyNo: Number(no),
      name,
      industry: toText(cell(row, 7)),
      address,
      contactPerson: '',
      phone: toText(cell(row, 6)),
      email: '',
      acceptanceStartDate: '',
      representativeName: toText(cell(row, 3)),
      regularEmployeeCount: cell(row, 8) ? Number(cell(row, 8)) || null : null,
      trainingManagerName: '',
      skillInstructor: '',
      lifeInstructor: '',
      dormitoryAddress: toText(cell(row, 27)),
      dormitoryMonthlyFee: null,
      dormitoryRoomSizeOk: '',
      dormitoryHasLock: '',
      dormitoryHasValuablesStorage: '',
      dormitoryInfo: '',
      notes: notesParts.join('\n'),
      status,
      leadStage: null,
    },
    regs: [
      ['責任者講習受講日', toDateStr(cell(row, 17)), ''],
      ['36協定', toDateStr(cell(row, 18)), ''],
      ['建設業許可', '', toDateStr(cell(row, 19))],
      ['建設キャリアアップ(事業者)ID', '', '', toText(cell(row, 21))],
      ['法人番号', '', '', toText(cell(row, 23))],
      ['雇用保険番号', '', '', toText(cell(row, 24))],
      ['実施者受理番号', '', '', toText(cell(row, 25))],
    ],
    auditDate: toDateStr(cell(row, 20)),
  };
}

function extractSupplementData(row) {
  const personalNo = cell(row, 4);
  if (!personalNo) return null;
  return {
    personalNo: Number(personalNo),
    data: {
      kikouSubmitDate: toDateStr(cell(row, 10)),
      kikouApprovedDate: toDateStr(cell(row, 11)),
      nyukanSubmitDate: toDateStr(cell(row, 12)),
      nyukanApprovedDate: toDateStr(cell(row, 13)),
      interruptionPeriod: toText(cell(row, 14)),
      examBasicDate: toDateStr(cell(row, 15)),
      examBasicResult: toText(cell(row, 16)),
      exam3Date: toDateStr(cell(row, 17)),
      exam3Subject: toText(cell(row, 18)),
      exam3Result: toText(cell(row, 19)),
      exam2Date: toDateStr(cell(row, 20)),
      exam2Subject: toText(cell(row, 21)),
      exam2Result: toText(cell(row, 22)),
    },
  };
}

function extractWorkerData(row) {
  const name = toText(cell(row, 6));
  const companyNo = cell(row, 1);
  if (!name || !companyNo) return null;

  const personalNo = cell(row, 4);
  const statusType = mapStatusType(cell(row, 12));
  const visaType = mapVisaType(statusType, cell(row, 13));

  const noteLines = [];
  const rawStage = toText(cell(row, 13));
  if (rawStage) noteLines.push(`元データ在留資格表記: ${rawStage}`);
  const postArrival = toText(cell(row, 14));
  if (postArrival) noteLines.push(`受入後講習: ${postArrival}`);
  const interviewDate = toDateStr(cell(row, 20));
  if (interviewDate) noteLines.push(`面接日: ${interviewDate}`);
  const managementEndDate = toDateStr(cell(row, 25));
  if (managementEndDate) noteLines.push(`監理終了日: ${managementEndDate}`);
  const leaveReason = toText(cell(row, 26));
  if (leaveReason) noteLines.push(`退職理由: ${leaveReason}`);
  const japaneseLevel = toText(cell(row, 27));
  if (japaneseLevel) noteLines.push(`日本語検定: ${japaneseLevel}`);
  const tokuteiStartDate = toDateStr(cell(row, 28));
  if (tokuteiStartDate) noteLines.push(`特定技能起算日: ${tokuteiStartDate}`);
  // 列29「特定技能経過年数」は元ファイルの共有数式キャッシュが不整合（不正な日付化け）を
  // 起こしていたため取り込み対象から除外。起算日は上で別途取得済み。
  const freeNote = toText(cell(row, 24));
  if (freeNote) noteLines.push(`備考: ${freeNote}`);

  return {
    name,
    managingOrg: toText(cell(row, 19)),
    companyNo: Number(companyNo),
    personalNo: personalNo ? Number(personalNo) : null,
    sendingOrgCode: cell(row, 11),
    statusType,
    leaveReason,
    noteLines,
    insertDataBase: {
      name,
      nameKana: toText(cell(row, 5)),
      nationality: toText(cell(row, 10)),
      gender: toText(cell(row, 9)),
      dob: toDateStr(cell(row, 7)),
      passportNumber: '',
      passportExpiryDate: '',
      residenceCardNumber: '',
      visaType,
      visaExpiryDate: toDateStr(cell(row, 15)),
      entryDate: toDateStr(cell(row, 21)),
      trainingStartDate: toDateStr(cell(row, 22)),
      jobCategory: toText(cell(row, 18)) || toText(cell(row, 17)),
      contractStartDate: '',
      contractEndDate: '',
      phone: '',
      homeCountryAddress: '',
      statusType,
      baseSalary: null,
      workingHours: '',
      workStartTime: '',
      workEndTime: '',
      holidays: '',
      payDate: '',
      overtimeRate: '',
      allowances: '',
      deductions: '',
      educationWorkHistory: '',
      dormitoryInfo: '',
      healthCheckDate: '',
      specialHealthChecks: JSON.stringify(buildSpecialHealthChecks()),
      consultationContact: '',
      insuranceStatus: '',
      tokuteiTrainingStatus: '',
      tokuteiTrainingDate: '',
    },
    // 退職理由が「失踪」の場合は、終了区分（終/在/未）によらず失踪として扱う。
    currentStage: leaveReason === '失踪' ? '失踪' : mapCurrentStage(cell(row, 3)),
    insuranceExpiry: toDateStr(cell(row, 16)),
    ccupWorkerId: toText(cell(row, 23)),
  };
}

// ExcelJSの WorkbookReader（ストリーミング解析）はメモリ使用量を抑えられる一方、
// ふりがな（フリガナ／ルビ）情報が付いた共有文字列セルで、本来のテキストではなく
// 読み仮名（カタカナ）を返す、あるいは文字化けするという重大な不具合があることが
// 判明した（実データの約4割のテキストセルで値が異なることを確認済み）。
// そのため、多少メモリを使っても正確な workbook.xlsx.load() による通常読み込みを使う。
async function streamExtract(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const companySheet = workbook.getWorksheet(COMPANY_SHEET);
  const workerSheet = workbook.getWorksheet(WORKER_SHEET);
  const workerSheet2 = workbook.getWorksheet(WORKER_SHEET_2);

  if (!companySheet || !workerSheet) {
    throw new Error(`必要なシート（${COMPANY_SHEET} / ${WORKER_SHEET}）が見つかりません。`);
  }

  const companyDataList = [];
  for (let r = 3; r <= companySheet.rowCount; r++) {
    const data = extractCompanyData(companySheet.getRow(r));
    if (data) companyDataList.push(data);
  }

  const workerDataList = [];
  for (let r = 4; r <= workerSheet.rowCount; r++) {
    const data = extractWorkerData(workerSheet.getRow(r));
    if (data) workerDataList.push(data);
  }

  const supplementByPersonalNo = new Map();
  if (workerSheet2) {
    for (let r = 4; r <= workerSheet2.rowCount; r++) {
      const s = extractSupplementData(workerSheet2.getRow(r));
      if (s) supplementByPersonalNo.set(s.personalNo, s.data);
    }
  }

  return { companyDataList, workerDataList, supplementByPersonalNo };
}

// buffer を解析し、進捗を確認できる summary オブジェクトと、完了を待てる promise を返す。
// summary はインポート処理の進行に合わせてその場で更新されるため、呼び出し側は
// promise の完了を待たずに同じ summary を参照して途中経過を確認できる。
function startImport(buffer) {
  const summary = {
    companiesImported: 0,
    workersImported: 0,
    workersSkippedOtherOrg: 0,
    sendingOrgsCreated: 0,
    registrationsCreated: 0,
    applicationCasesCreated: 0,
    auditRecordsCreated: 0,
    companiesTotal: 0,
    workersTotal: 0,
    errors: [],
  };
  const promise = runImport(buffer, summary);
  return { summary, promise };
}

async function runImport(buffer, summary) {
  const { companyDataList, workerDataList, supplementByPersonalNo } = await streamExtract(buffer);

  // ---------- 1. 受入企業データ ----------
  summary.companiesTotal = companyDataList.length;
  const companyNoToId = new Map();
  await mapWithConcurrency(companyDataList, 6, async (item) => {
    try {
      const record = await hostCompanies.insert(item.insertData);
      companyNoToId.set(item.no, record.id);
      summary.companiesImported++;

      for (const [label, issueDate, expiryDate, regNumber] of item.regs) {
        if (!issueDate && !expiryDate && !regNumber) continue;
        await companyRegistrations.insert({
          hostCompanyId: record.id,
          label,
          registrationNumber: regNumber || '',
          issueDate: issueDate || '',
          expiryDate: expiryDate || '',
          notes: '',
        });
        summary.registrationsCreated++;
      }

      if (item.auditDate) {
        await visitsAudits.insert({
          workerId: null,
          hostCompanyId: record.id,
          type: '監査',
          scheduledDate: item.auditDate,
          completedDate: item.auditDate,
          result: '',
          notes: 'Excel取り込み',
        });
        summary.auditRecordsCreated++;
      }
    } catch (err) {
      summary.errors.push(`受入企業「${item.name}」の取り込みに失敗: ${err.message}`);
    }
  });

  // ---------- 2. 送出機関（コード → 実レコード） ----------
  const sendingOrgCache = new Map();
  const sendingOrgPending = new Map();
  const existingOrgs = await sendingOrgs.list();
  for (const o of existingOrgs) sendingOrgCache.set(o.name, o.id);

  async function resolveSendingOrgId(code) {
    const c = toText(code);
    if (!c || c === '無') return null;
    if (sendingOrgCache.has(c)) return sendingOrgCache.get(c);
    // 対象者を並列処理するため、同じコードの新規団体が同時に複数回作られないよう
    // 進行中の作成処理を共有する。
    if (sendingOrgPending.has(c)) return sendingOrgPending.get(c);
    const pending = (async () => {
      const created = await sendingOrgs.insert({
        name: c,
        country: 'ベトナム',
        licenseNumber: '',
        contactPerson: '',
        contactPhone: '',
        contactEmail: '',
        notes: 'Excel取り込み（コード名のみ。正式名称は後で編集してください）',
      });
      sendingOrgCache.set(c, created.id);
      summary.sendingOrgsCreated++;
      return created.id;
    })();
    sendingOrgPending.set(c, pending);
    const id = await pending;
    sendingOrgPending.delete(c);
    return id;
  }

  // ---------- 3. 監理外国人名簿（対象者本体） ----------
  summary.workersTotal = workerDataList.length;

  await mapWithConcurrency(workerDataList, 6, async (item) => {
    if (item.managingOrg && item.managingOrg !== MANAGING_ORG_FILTER) {
      summary.workersSkippedOtherOrg++;
      return;
    }

    const hostCompanyId = companyNoToId.get(item.companyNo) || null;
    const supplement = item.personalNo ? supplementByPersonalNo.get(item.personalNo) : null;

    const noteLines = [...item.noteLines];
    if (supplement) {
      if (supplement.interruptionPeriod) noteLines.push(`実習中断期間: ${supplement.interruptionPeriod}`);
      if (supplement.examBasicDate) noteLines.push(`基礎級受験日: ${supplement.examBasicDate}（${supplement.examBasicResult}）`);
      if (supplement.exam3Date) noteLines.push(`随時3級受験日: ${supplement.exam3Date} ${supplement.exam3Subject}（${supplement.exam3Result}）`);
      if (supplement.exam2Date) noteLines.push(`随時2級受験日: ${supplement.exam2Date} ${supplement.exam2Subject}（${supplement.exam2Result}）`);
    }

    try {
      const sendingOrgId = await resolveSendingOrgId(item.sendingOrgCode);

      const workerRecord = await workers.insert({
        ...item.insertDataBase,
        personalNo: item.personalNo,
        hostCompanyId,
        sendingOrgId,
        notes: noteLines.join('\n'),
        currentStage: item.currentStage,
      });
      summary.workersImported++;

      if (item.insuranceExpiry) {
        await workerRegistrations.insert({
          workerId: workerRecord.id,
          label: '技能実習生総合保険',
          registrationNumber: '',
          issueDate: '',
          expiryDate: item.insuranceExpiry,
          notes: '',
        });
        summary.registrationsCreated++;
      }
      if (item.ccupWorkerId) {
        await workerRegistrations.insert({
          workerId: workerRecord.id,
          label: '建設キャリアアップカード',
          registrationNumber: item.ccupWorkerId,
          issueDate: '',
          expiryDate: '',
          notes: '',
        });
        summary.registrationsCreated++;
      }

      if (supplement && (supplement.kikouSubmitDate || supplement.kikouApprovedDate || supplement.nyukanSubmitDate)) {
        const status = supplement.kikouApprovedDate ? '認定済み' : supplement.kikouSubmitDate ? '提出済み' : '書類準備中';
        const caseNotes = [];
        if (supplement.nyukanSubmitDate) caseNotes.push(`入管申請提出日: ${supplement.nyukanSubmitDate}`);
        if (supplement.nyukanApprovedDate) caseNotes.push(`入管認定通知到着日: ${supplement.nyukanApprovedDate}`);
        await applicationCases.insert({
          workerId: workerRecord.id,
          statusType: item.statusType,
          stage: '初回申請',
          status,
          dueDate: '',
          submittedDate: supplement.kikouSubmitDate,
          approvedDate: supplement.kikouApprovedDate,
          notes: caseNotes.join('\n'),
          checklist: JSON.stringify(buildChecklist(item.statusType)),
        });
        summary.applicationCasesCreated++;
      }
    } catch (err) {
      summary.errors.push(`対象者「${item.name}」の取り込みに失敗: ${err.message}`);
    }
  });
}

module.exports = { startImport };
