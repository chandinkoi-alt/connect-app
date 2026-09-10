const express = require('express');
const ExcelJS = require('exceljs');
const { workers, hostCompanies, sendingOrgs, applicationCases, visitsAudits, workerRegistrations } = require('../db');
const { getWorkerVisaUrgency } = require('../lib/dates');
const { SPECIAL_HEALTH_CHECK_TYPES, buildSpecialHealthChecks } = require('../lib/healthChecks');

const router = express.Router();

const VISA_TYPES = ['技能実習1号', '技能実習2号', '技能実習3号', '育成就労', '特定技能1号', '特定技能2号'];
const STATUS_TYPES = ['技能実習', '育成就労', '特定技能'];
const STAGE_OPTIONS = ['準備中', '就労中', '一時帰国中', '帰国済み', '失踪'];
const TOKUTEI_TRAINING_STATUSES = ['未受講', '受講中', '受講済み'];

function joinWorker(worker, companyById, sendingOrgById) {
  const company = worker.hostCompanyId ? companyById.get(worker.hostCompanyId) : null;
  const sendingOrg = worker.sendingOrgId ? sendingOrgById.get(worker.sendingOrgId) : null;
  return {
    ...worker,
    companyName: company ? company.name : '',
    sendingOrgName: sendingOrg ? sendingOrg.name : '',
    visaStatus: getWorkerVisaUrgency(worker),
    specialHealthChecks: JSON.parse(worker.specialHealthChecks || '[]'),
  };
}

async function withJoins(worker) {
  const company = worker.hostCompanyId ? await hostCompanies.get(worker.hostCompanyId) : null;
  const sendingOrg = worker.sendingOrgId ? await sendingOrgs.get(worker.sendingOrgId) : null;
  return joinWorker(
    worker,
    new Map(company ? [[company.id, company]] : []),
    new Map(sendingOrg ? [[sendingOrg.id, sendingOrg]] : [])
  );
}

// 一覧表示など、大量の対象者をまとめて結合するとき用。企業・送出機関を1回ずつ取得して
// Mapで引くことで、件数分だけ .get() を呼ぶ（Tursoへ通信するたびに時間がかかる）のを防ぐ。
async function withJoinsAll(workerList) {
  const [allCompanies, allSendingOrgs] = await Promise.all([hostCompanies.list(), sendingOrgs.list()]);
  const companyById = new Map(allCompanies.map((c) => [c.id, c]));
  const sendingOrgById = new Map(allSendingOrgs.map((o) => [o.id, o]));
  return workerList.map((w) => joinWorker(w, companyById, sendingOrgById));
}

function buildRecord(body, existing = {}) {
  return {
    personalNo: existing.personalNo ?? null,
    name: (body.name || '').trim(),
    nameKana: (body.nameKana || '').trim(),
    nationality: (body.nationality || '').trim(),
    gender: body.gender || '',
    dob: body.dob || '',
    passportNumber: (body.passportNumber || '').trim(),
    passportExpiryDate: body.passportExpiryDate || '',
    residenceCardNumber: (body.residenceCardNumber || '').trim(),
    visaType: body.visaType || '',
    visaExpiryDate: body.visaExpiryDate || '',
    // 在留期限そのものが変更された場合（更新完了で新しい期限が入力された等）は、
    // 古い期限に対する「手続き済み」マークを引き継がない。
    visaRenewalSubmittedDate:
      body.visaExpiryDate !== undefined && body.visaExpiryDate !== existing.visaExpiryDate
        ? ''
        : (body.visaRenewalSubmittedDate ?? existing.visaRenewalSubmittedDate ?? ''),
    entryDate: body.entryDate || '',
    trainingStartDate: body.trainingStartDate || '',
    hostCompanyId: body.hostCompanyId ? Number(body.hostCompanyId) : null,
    sendingOrgId: body.sendingOrgId ? Number(body.sendingOrgId) : null,
    jobCategory: (body.jobCategory || '').trim(),
    contractStartDate: body.contractStartDate || '',
    contractEndDate: body.contractEndDate || '',
    phone: (body.phone || '').trim(),
    homeCountryAddress: (body.homeCountryAddress || '').trim(),
    notes: (body.notes || '').trim(),
    statusType: body.statusType || STATUS_TYPES[0],
    currentStage: body.currentStage || '',
    baseSalary: body.baseSalary ? Number(body.baseSalary) : null,
    workingHours: (body.workingHours || '').trim(),
    workStartTime: (body.workStartTime || '').trim(),
    workEndTime: (body.workEndTime || '').trim(),
    holidays: (body.holidays || '').trim(),
    payDate: (body.payDate || '').trim(),
    overtimeRate: (body.overtimeRate || '').trim(),
    allowances: (body.allowances || '').trim(),
    deductions: (body.deductions || '').trim(),
    educationWorkHistory: (body.educationWorkHistory || '').trim(),
    dormitoryInfo: (body.dormitoryInfo || '').trim(),
    healthCheckDate: body.healthCheckDate || '',
    specialHealthChecks: body.specialHealthChecks
      ? JSON.stringify(body.specialHealthChecks)
      : existing.specialHealthChecks || JSON.stringify(buildSpecialHealthChecks()),
    consultationContact: (body.consultationContact || '').trim(),
    insuranceStatus: (body.insuranceStatus || '').trim(),
    tokuteiTrainingStatus: body.tokuteiTrainingStatus || '',
    tokuteiTrainingDate: body.tokuteiTrainingDate || '',
    generation: (body.generation ?? existing.generation ?? '').toString().trim(),
    // 技能実習計画認定申請書 第2面「10 技能実習生の待遇」用
    wageType: body.wageType || '',
    trainingAllowance: body.trainingAllowance ? Number(body.trainingAllowance) : null,
    breakStartTime: (body.breakStartTime || '').trim(),
    breakEndTime: (body.breakEndTime || '').trim(),
    annualWorkingHours: body.annualWorkingHours ? Number(body.annualWorkingHours) : null,
    weeklyAverageWorkingHours: (body.weeklyAverageWorkingHours || '').trim(),
    leaveInfo: (body.leaveInfo || '').trim(),
    mealFee: body.mealFee ? Number(body.mealFee) : null,
    housingFeeDeduction: body.housingFeeDeduction ? Number(body.housingFeeDeduction) : null,
    otherFeeDeduction: body.otherFeeDeduction ? Number(body.otherFeeDeduction) : null,
  };
}

function validate(body) {
  const errors = [];
  if (!body.name || !body.name.trim()) errors.push('氏名は必須です。');
  if (!body.visaType || !VISA_TYPES.includes(body.visaType)) errors.push('在留資格を正しく選択してください。');
  if (!body.visaExpiryDate) errors.push('在留期限は必須です。');
  if (!body.statusType || !STATUS_TYPES.includes(body.statusType)) errors.push('制度区分を正しく選択してください。');
  return errors;
}

router.get('/visa-types', (req, res) => res.json(VISA_TYPES));
router.get('/status-types', (req, res) => res.json(STATUS_TYPES));
router.get('/stage-options', (req, res) => res.json(STAGE_OPTIONS));
router.get('/tokutei-training-statuses', (req, res) => res.json(TOKUTEI_TRAINING_STATUSES));
router.get('/special-health-check-types', (req, res) => res.json(SPECIAL_HEALTH_CHECK_TYPES));

router.get('/', async (req, res) => {
  const { statusType, hostCompanyId, search } = req.query;
  let result = await withJoinsAll(await workers.list());

  if (statusType) result = result.filter((w) => w.statusType === statusType);
  if (hostCompanyId) result = result.filter((w) => w.hostCompanyId === Number(hostCompanyId));
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.companyName.toLowerCase().includes(q) ||
        w.nationality.toLowerCase().includes(q)
    );
  }

  result.sort((a, b) => {
    const da = a.visaStatus.days;
    const db = b.visaStatus.days;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });

  res.json(result);
});

// 人材360: 対象者の詳細プロフィール + 関連する認定申請・面談監査記録・登録保険情報
router.get('/:id/profile360', async (req, res) => {
  const id = Number(req.params.id);
  const worker = await workers.get(id);
  if (!worker) return res.status(404).json({ error: '対象者が見つかりません。' });

  const cases = (await applicationCases.list()).filter((c) => c.workerId === id);
  const visits = (await visitsAudits.list()).filter((v) => v.workerId === id);
  const registrations = await workerRegistrations.listByWorker(id);

  res.json({
    worker: await withJoins(worker),
    applicationCases: cases.map((c) => ({ ...c, checklist: JSON.parse(c.checklist || '[]') })),
    visits,
    registrations,
  });
});

router.get('/:id', async (req, res) => {
  const worker = await workers.get(Number(req.params.id));
  if (!worker) return res.status(404).json({ error: '対象者が見つかりません。' });
  res.json(await withJoins(worker));
});

router.post('/', async (req, res) => {
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ errors });
  res.status(201).json(await withJoins(await workers.insert(buildRecord(req.body))));
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await workers.get(id);
  if (!existing) return res.status(404).json({ error: '対象者が見つかりません。' });
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ errors });
  res.json(await withJoins(await workers.update(id, buildRecord(req.body, existing))));
});

router.delete('/:id', async (req, res) => {
  const deleted = await workers.remove(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: '対象者が見つかりません。' });
  res.json({ ok: true });
});

// 在留期間更新等の手続きを「提出済み」としてマーク／解除する（一覧から1クリックで
// 切り替えられるようにするための専用エンドポイント。他の必須項目の再入力は不要）。
router.put('/:id/visa-renewal', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await workers.get(id);
  if (!existing) return res.status(404).json({ error: '対象者が見つかりません。' });
  const submitted = !!req.body.submitted;
  const visaRenewalSubmittedDate = submitted ? new Date().toISOString().slice(0, 10) : '';
  res.json(await withJoins(await workers.update(id, { ...existing, visaRenewalSubmittedDate })));
});

// 登録・保険（対象者単位）
router.get('/:id/registrations', async (req, res) => {
  const workerId = Number(req.params.id);
  if (!(await workers.get(workerId))) return res.status(404).json({ error: '対象者が見つかりません。' });
  res.json(await workerRegistrations.listByWorker(workerId));
});

router.post('/:id/registrations', async (req, res) => {
  const workerId = Number(req.params.id);
  if (!(await workers.get(workerId))) return res.status(404).json({ error: '対象者が見つかりません。' });
  const label = (req.body.label || '').trim();
  if (!label) return res.status(400).json({ errors: ['項目名は必須です。'] });
  const record = await workerRegistrations.insert({
    workerId,
    label,
    registrationNumber: (req.body.registrationNumber || '').trim(),
    issueDate: req.body.issueDate || '',
    expiryDate: req.body.expiryDate || '',
    notes: (req.body.notes || '').trim(),
  });
  res.status(201).json(record);
});

router.put('/:id/registrations/:regId', async (req, res) => {
  const workerId = Number(req.params.id);
  const regId = Number(req.params.regId);
  const existing = await workerRegistrations.get(regId);
  if (!existing || existing.workerId !== workerId) {
    return res.status(404).json({ error: '登録項目が見つかりません。' });
  }
  const label = (req.body.label ?? existing.label).toString().trim();
  if (!label) return res.status(400).json({ errors: ['項目名は必須です。'] });
  const updated = await workerRegistrations.update(regId, {
    workerId,
    label,
    registrationNumber: (req.body.registrationNumber ?? existing.registrationNumber ?? '').toString().trim(),
    issueDate: req.body.issueDate ?? existing.issueDate ?? '',
    expiryDate: req.body.expiryDate ?? existing.expiryDate ?? '',
    notes: (req.body.notes ?? existing.notes ?? '').toString().trim(),
  });
  res.json(updated);
});

router.delete('/:id/registrations/:regId', async (req, res) => {
  const workerId = Number(req.params.id);
  const regId = Number(req.params.regId);
  const existing = await workerRegistrations.get(regId);
  if (!existing || existing.workerId !== workerId) {
    return res.status(404).json({ error: '登録項目が見つかりません。' });
  }
  await workerRegistrations.remove(regId);
  res.json({ ok: true });
});

// Excel取り込み（lib/excelImport.js）でこのアプリに取り込んだ際、元の
// 「監理外国人名簿」シートの列のうち専用項目を持たないもの（面接日・受入後講習・
// 監理終了日・退職理由・日本語検定・特定技能起算日・元データ在留資格表記・備考）は
// 「ラベル: 値」の形で notes 欄に1行ずつまとめて保存している。名簿として出力し直す際、
// ここから該当行を抜き出して元の列へ戻す。
function extractNoteField(notes, label) {
  if (!notes) return '';
  const m = notes.match(new RegExp(`^${label}:\\s*(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

function parseIsoDate(s) {
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(s) : null;
}

function calcAge(dob) {
  const d = parseIsoDate(dob);
  if (!d) return '';
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) age--;
  return age;
}

// 元の名簿の③列（終/未/在）。失踪は退職理由列で表すため、区分としては
// 「終」（管理終了）扱いにする。
function stageToLetter(stage) {
  if (stage === '帰国済み' || stage === '失踪') return '終';
  if (stage === '準備中') return '未';
  if (stage === '就労中') return '在';
  return '';
}

function statusTypeToCode(statusType) {
  return statusType === '特定技能' ? '特定' : '実習生';
}

// 取り込み元に無かった新規対象者（notesに「元データ在留資格表記」が無い）の場合、
// 在留資格（visaType）から簡易的に号数だけを再現する。
function visaStageFallback(visaType) {
  const m = (visaType || '').match(/([1-3])号/);
  if (!m) return '';
  return '１２３'[Number(m[1]) - 1] + '号';
}

router.get('/export/roster', async (req, res) => {
  const [rosterRows, allRegistrations, allCompanies] = await Promise.all([
    withJoinsAll(await workers.list()),
    workerRegistrations.list(),
    hostCompanies.list(),
  ]);
  const regsByWorker = new Map();
  for (const reg of allRegistrations) {
    if (!regsByWorker.has(reg.workerId)) regsByWorker.set(reg.workerId, []);
    regsByWorker.get(reg.workerId).push(reg);
  }
  // joinWorker はcompanyNameのみ付与するため、企業№は別途ここで引く。
  const companyById = new Map(allCompanies.map((c) => [c.id, c]));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('監理外国人名簿');

  sheet.getCell('A2').value = '更新日：';
  sheet.getCell('B2').value = new Date();
  sheet.getCell('B2').numFmt = 'yyyy/mm/dd';
  sheet.getCell('O2').value = '3カ月前 赤';
  sheet.getCell('O2').font = { color: { argb: 'FFFF0000' } };

  const headers = [
    '企業№', '企業名', '', '個人連番', '実習生氏名（カナ）', '実習生氏名', '生年月日', '年齢', '性別',
    '国籍', '送出', '種別', '在留資格', '受入後講習', '在留期限', '総合保険', '職別', '作業名', '監理',
    '面接日', '入国日', '配属日', '建設ｷｬﾘｱｱｯﾌﾟ\nCCUP', '備考', '監理終了日', '退職理由', '日本語\n検定',
    '特定技能\n起算日', '特定技能\n経過年数',
  ];
  const headerRow = sheet.getRow(3);
  headers.forEach((h, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
    c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
  });
  headerRow.height = 30;

  const widths = [6, 22, 4, 8, 18, 18, 12, 6, 6, 10, 8, 8, 10, 12, 12, 10, 10, 16, 8, 12, 12, 12, 12, 22, 12, 12, 8, 12, 10];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  let r = 4;
  for (const w of rosterRows) {
    const regs = regsByWorker.get(w.id) || [];
    const insurance = regs.find((x) => x.label === '技能実習生総合保険');
    const ccup = regs.find((x) => x.label === '建設キャリアアップカード');
    const row = sheet.getRow(r);

    const company = w.hostCompanyId ? companyById.get(w.hostCompanyId) : null;
    row.getCell(1).value = (company && company.companyNo) || '';
    row.getCell(2).value = w.companyName || '';
    row.getCell(3).value = stageToLetter(w.currentStage);
    row.getCell(4).value = w.personalNo || '';
    row.getCell(5).value = w.nameKana || '';
    row.getCell(6).value = w.name || '';
    const dob = parseIsoDate(w.dob);
    if (dob) {
      row.getCell(7).value = dob;
      row.getCell(7).numFmt = 'yyyy/mm/dd';
    }
    row.getCell(8).value = calcAge(w.dob);
    row.getCell(9).value = w.gender || '';
    row.getCell(10).value = w.nationality || '';
    row.getCell(12).value = statusTypeToCode(w.statusType);
    row.getCell(13).value = extractNoteField(w.notes, '元データ在留資格表記') || visaStageFallback(w.visaType);
    row.getCell(14).value = extractNoteField(w.notes, '受入後講習');
    const visaExpiry = parseIsoDate(w.visaExpiryDate);
    if (visaExpiry) {
      const c = row.getCell(15);
      c.value = visaExpiry;
      c.numFmt = 'yyyy/mm/dd';
      if (w.visaStatus.level === 'expired' || w.visaStatus.level === 'warning') {
        c.font = { color: { argb: 'FFFF0000' } };
      }
    }
    const insuranceExpiry = insurance ? parseIsoDate(insurance.expiryDate) : null;
    if (insuranceExpiry) {
      row.getCell(16).value = insuranceExpiry;
      row.getCell(16).numFmt = 'yyyy/mm/dd';
    }
    row.getCell(18).value = w.jobCategory || '';
    row.getCell(19).value = 'ｺﾈｸﾄ';
    row.getCell(20).value = extractNoteField(w.notes, '面接日');
    const entryDate = parseIsoDate(w.entryDate);
    if (entryDate) {
      row.getCell(21).value = entryDate;
      row.getCell(21).numFmt = 'yyyy/mm/dd';
    }
    const trainingStartDate = parseIsoDate(w.trainingStartDate);
    if (trainingStartDate) {
      row.getCell(22).value = trainingStartDate;
      row.getCell(22).numFmt = 'yyyy/mm/dd';
    }
    row.getCell(23).value = ccup ? ccup.registrationNumber : '';
    row.getCell(24).value = extractNoteField(w.notes, '備考');
    row.getCell(25).value = extractNoteField(w.notes, '監理終了日');
    row.getCell(26).value = extractNoteField(w.notes, '退職理由') || (w.currentStage === '失踪' ? '失踪' : '');
    row.getCell(27).value = extractNoteField(w.notes, '日本語検定');
    row.getCell(28).value = extractNoteField(w.notes, '特定技能起算日');
    r++;
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=meibo.xlsx');
  await workbook.xlsx.write(res);
  res.end();
});

router.get('/:id/document', async (req, res) => {
  const worker = await workers.get(Number(req.params.id));
  if (!worker) return res.status(404).json({ error: '対象者が見つかりません。' });
  const joined = await withJoins(worker);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('個人票');
  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 32;

  const title = `${joined.statusType} 個人票`;
  sheet.mergeCells('A1:B1');
  sheet.getCell('A1').value = title;
  sheet.getCell('A1').font = { bold: true, size: 14 };

  const rows = [
    ['氏名', joined.name],
    ['フリガナ', joined.nameKana],
    ['国籍', joined.nationality],
    ['性別', joined.gender],
    ['生年月日', joined.dob],
    ['旅券番号', joined.passportNumber],
    ['旅券有効期限', joined.passportExpiryDate],
    ['在留カード番号', joined.residenceCardNumber],
    ['制度区分', joined.statusType],
    ['在留資格', joined.visaType],
    ['在留期限', joined.visaExpiryDate],
    ['入国日', joined.entryDate],
    ['実習・就労開始日', joined.trainingStartDate],
    ['ステータス', joined.currentStage],
    ['受入企業', joined.companyName],
    ['送出機関', joined.sendingOrgName],
    ['職種・作業', joined.jobCategory],
    ['本国住所', joined.homeCountryAddress],
    ['学歴・職歴', joined.educationWorkHistory],
    ['雇用契約開始日', joined.contractStartDate],
    ['雇用契約終了日', joined.contractEndDate],
    ['基本賃金', joined.baseSalary],
    ['始業時刻', joined.workStartTime],
    ['終業時刻', joined.workEndTime],
    ['休日', joined.holidays],
    ['給料支払日', joined.payDate],
    ['宿舎情報', joined.dormitoryInfo],
    ['電話番号', joined.phone],
    ['備考', joined.notes],
  ];
  rows.forEach(([label, value]) => {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=kojinhyo_${joined.name || joined.id}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
