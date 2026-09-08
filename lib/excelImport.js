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

async function importWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const companySheet = workbook.getWorksheet(COMPANY_SHEET);
  const workerSheet = workbook.getWorksheet(WORKER_SHEET);
  const workerSheet2 = workbook.getWorksheet(WORKER_SHEET_2);

  if (!companySheet || !workerSheet) {
    throw new Error(`必要なシート（${COMPANY_SHEET} / ${WORKER_SHEET}）が見つかりません。`);
  }

  const summary = {
    companiesImported: 0,
    workersImported: 0,
    workersSkippedOtherOrg: 0,
    sendingOrgsCreated: 0,
    registrationsCreated: 0,
    applicationCasesCreated: 0,
    auditRecordsCreated: 0,
    errors: [],
  };

  // ---------- 1. 受入企業データ ----------
  const companyNoToId = new Map();
  for (let r = 3; r <= companySheet.rowCount; r++) {
    const row = companySheet.getRow(r);
    const no = cell(row, 1);
    const name = toText(cell(row, 2));
    if (!no || !name) continue;

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

    try {
      const record = await hostCompanies.insert({
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
        status: 'active',
        leadStage: null,
      });
      companyNoToId.set(Number(no), record.id);
      summary.companiesImported++;

      const regs = [
        ['責任者講習受講日', toDateStr(cell(row, 17)), ''],
        ['36協定', toDateStr(cell(row, 18)), ''],
        ['建設業許可', '', toDateStr(cell(row, 19))],
        ['建設キャリアアップ(事業者)ID', '', '', toText(cell(row, 21))],
        ['法人番号', '', '', toText(cell(row, 23))],
        ['雇用保険番号', '', '', toText(cell(row, 24))],
        ['実施者受理番号', '', '', toText(cell(row, 25))],
      ];
      for (const [label, issueDate, expiryDate, regNumber] of regs) {
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

      const auditDate = toDateStr(cell(row, 20));
      if (auditDate) {
        await visitsAudits.insert({
          workerId: null,
          hostCompanyId: record.id,
          type: '監査',
          scheduledDate: auditDate,
          completedDate: auditDate,
          result: '',
          notes: 'Excel取り込み',
        });
        summary.auditRecordsCreated++;
      }
    } catch (err) {
      summary.errors.push(`受入企業「${name}」の取り込みに失敗: ${err.message}`);
    }
  }

  // ---------- 2. 送出機関（コード → 実レコード） ----------
  const sendingOrgCache = new Map();
  const existingOrgs = await sendingOrgs.list();
  for (const o of existingOrgs) sendingOrgCache.set(o.name, o.id);

  async function resolveSendingOrgId(code) {
    const c = toText(code);
    if (!c || c === '無') return null;
    if (sendingOrgCache.has(c)) return sendingOrgCache.get(c);
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
  }

  // ---------- 3. 監理外国人名簿(2) を個人連番でインデックス化 ----------
  const supplementByPersonalNo = new Map();
  if (workerSheet2) {
    for (let r = 4; r <= workerSheet2.rowCount; r++) {
      const row = workerSheet2.getRow(r);
      const personalNo = cell(row, 4);
      if (!personalNo) continue;
      supplementByPersonalNo.set(Number(personalNo), {
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
      });
    }
  }

  // ---------- 4. 監理外国人名簿（対象者本体） ----------
  for (let r = 4; r <= workerSheet.rowCount; r++) {
    const row = workerSheet.getRow(r);
    const name = toText(cell(row, 6));
    const companyNo = cell(row, 1);
    if (!name || !companyNo) continue;

    const managingOrg = toText(cell(row, 19));
    if (managingOrg && managingOrg !== MANAGING_ORG_FILTER) {
      summary.workersSkippedOtherOrg++;
      continue;
    }

    const hostCompanyId = companyNoToId.get(Number(companyNo)) || null;
    const statusType = mapStatusType(cell(row, 12));
    const visaType = mapVisaType(statusType, cell(row, 13));
    const personalNo = cell(row, 4);

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

    const supplement = personalNo ? supplementByPersonalNo.get(Number(personalNo)) : null;
    if (supplement) {
      if (supplement.interruptionPeriod) noteLines.push(`実習中断期間: ${supplement.interruptionPeriod}`);
      if (supplement.examBasicDate) noteLines.push(`基礎級受験日: ${supplement.examBasicDate}（${supplement.examBasicResult}）`);
      if (supplement.exam3Date) noteLines.push(`随時3級受験日: ${supplement.exam3Date} ${supplement.exam3Subject}（${supplement.exam3Result}）`);
      if (supplement.exam2Date) noteLines.push(`随時2級受験日: ${supplement.exam2Date} ${supplement.exam2Subject}（${supplement.exam2Result}）`);
    }

    try {
      const sendingOrgId = await resolveSendingOrgId(cell(row, 11));
      const jobCategory = toText(cell(row, 18)) || toText(cell(row, 17));

      const workerRecord = await workers.insert({
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
        hostCompanyId,
        sendingOrgId,
        jobCategory,
        contractStartDate: '',
        contractEndDate: '',
        phone: '',
        homeCountryAddress: '',
        notes: noteLines.join('\n'),
        statusType,
        currentStage: mapCurrentStage(cell(row, 3)),
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
      });
      summary.workersImported++;

      const insuranceExpiry = toDateStr(cell(row, 16));
      if (insuranceExpiry) {
        await workerRegistrations.insert({
          workerId: workerRecord.id,
          label: '技能実習生総合保険',
          registrationNumber: '',
          issueDate: '',
          expiryDate: insuranceExpiry,
          notes: '',
        });
        summary.registrationsCreated++;
      }
      const ccupWorkerId = toText(cell(row, 23));
      if (ccupWorkerId) {
        await workerRegistrations.insert({
          workerId: workerRecord.id,
          label: '建設キャリアアップカード',
          registrationNumber: ccupWorkerId,
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
          statusType,
          stage: '初回申請',
          status,
          dueDate: '',
          submittedDate: supplement.kikouSubmitDate,
          approvedDate: supplement.kikouApprovedDate,
          notes: caseNotes.join('\n'),
          checklist: JSON.stringify(buildChecklist(statusType)),
        });
        summary.applicationCasesCreated++;
      }
    } catch (err) {
      summary.errors.push(`対象者「${name}」の取り込みに失敗: ${err.message}`);
    }
  }

  return summary;
}

module.exports = { importWorkbook };
