// 技能実習計画認定申請書（別記様式第１号）第1面・第2面・第7面のPDFを生成する。
// 実際の省令様式の罫線・書式を厳密に再現するものではなく、様式に記載すべき
// 項目を同じ構成・見出し番号（①②③…）で整理して出力する「記入内容の下書き・
// 確認用」PDFという位置づけ（第3〜6面の講習・実習スケジュール表は未対応）。
const path = require('path');

const FONT_REGULAR = path.join(__dirname, '../fonts/ipag.ttf');
const PAGE_MARGIN = 40;
const INK = '#1a1a1a';
const MUTED = '#555555';
const LINE = '#999999';
const HEADER_FILL = '#f2f2f2';

const PLAN_TYPE_LABELS = {
  A: 'A（第一号企業単独型）',
  B: 'B（第二号企業単独型）',
  C: 'C（第三号企業単独型）',
  D: 'D（第一号団体監理型）',
  E: 'E（第二号団体監理型）',
  F: 'F（第三号団体監理型）',
};
const SUPERVISED_TYPES = new Set(['D', 'E', 'F']);
const GEN_2_3_TYPES = new Set(['B', 'C', 'E', 'F']);

function formatJpDate(iso) {
  if (!iso) return '　　　　年　　月　　日';
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return iso;
  return `${y}年${Number(m)}月${Number(d)}日`;
}

function calcAge(dob) {
  if (!dob) return '';
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function boldText(doc, str, x, y, opts) {
  doc.text(str, x, y, opts);
  doc.text(str, x + 0.3, y, opts);
}

function generateCertificationApplicationPdf(doc, data) {
  doc.registerFont('jp', FONT_REGULAR);
  doc.font('jp');

  const { company, worker, applicationCase: ac, officers, supervisingOrg, sendingOrg } = data;
  const contentW = doc.page.width - PAGE_MARGIN * 2;
  const left = PAGE_MARGIN;
  const right = left + contentW;

  // ---------- 状態を保持しつつ、共通の描画ヘルパーを用意する ----------
  let y = PAGE_MARGIN;

  function pageFooter(label) {
    doc.fontSize(8).fillColor(MUTED).text(label, left, doc.page.height - 24, { width: contentW, align: 'center' });
  }

  function sectionTitle(text) {
    if (y > doc.page.height - PAGE_MARGIN - 40) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    y += 6;
    doc.fontSize(11).fillColor(INK);
    boldText(doc, text, left, y, { width: contentW });
    y += 16;
    doc.moveTo(left, y - 3).lineTo(right, y - 3).lineWidth(0.75).strokeColor(LINE).stroke();
  }

  // ラベルの列を左に、値の列を右に、罫線の入った1行を描く（複数のラベル/値ペアを横に並べられる）
  function fieldRow(pairs, opts = {}) {
    const rowH = opts.height || 20;
    if (y + rowH > doc.page.height - PAGE_MARGIN - 20) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    const colW = contentW / pairs.length;
    let cx = left;
    doc.lineWidth(0.75).strokeColor(LINE);
    pairs.forEach(([label, value]) => {
      const labelW = Math.min(120, colW * 0.38);
      doc.rect(cx, y, colW, rowH).stroke();
      doc.rect(cx, y, labelW, rowH).fill(HEADER_FILL);
      doc.fillColor(INK).fontSize(8.5).text(label, cx + 4, y + rowH / 2 - 5, { width: labelW - 8 });
      doc.fillColor(INK).fontSize(9).text(String(value ?? '') || '－', cx + labelW + 4, y + rowH / 2 - 5, {
        width: colW - labelW - 8,
      });
      cx += colW;
    });
    y += rowH;
  }

  // 値のみを1行いっぱいに表示する（備考など長文向け）
  function longFieldRow(label, value, opts = {}) {
    const rowH = opts.height || 30;
    if (y + rowH > doc.page.height - PAGE_MARGIN - 20) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    doc.lineWidth(0.75).strokeColor(LINE).rect(left, y, contentW, rowH).stroke();
    doc.rect(left, y, 110, rowH).fill(HEADER_FILL);
    doc.fillColor(INK).fontSize(8.5).text(label, left + 4, y + 6, { width: 100 });
    doc.fillColor(INK).fontSize(9).text(String(value ?? '') || '－', left + 118, y + 6, { width: contentW - 126 });
    y += rowH;
  }

  // ============================================================
  // 第１面
  // ============================================================
  doc.fontSize(9).fillColor(MUTED).text('別記様式第１号（第４条第１項関係）', left, y);
  y += 20;
  doc.fontSize(16).fillColor(INK);
  boldText(doc, '技能実習計画　認定申請書', left, y, { width: contentW, align: 'center' });
  y += 40;

  doc.fontSize(10).fillColor(INK).text(`申請日　${formatJpDate(ac.applicationDate)}`, left, y);
  y += 30;
  doc.text('外国人技能実習機構　理事長　殿', left, y);
  y += 30;
  boldText(doc, `申請者　${company ? company.name : ''}`, left, y, { width: contentW });
  y += 30;

  doc.fontSize(9.5).fillColor(MUTED).text(
    '次の技能実習計画について、申請者は、外国人の技能実習の適正な実施及び技能実習生の保護に関する法律（以下「法」という。）' +
      '第10条各号に規定する欠格事由（第７面記載）を確認するとともに、そのいずれにも該当しないことを誓約し、法第８条第１項の認定を申請します。',
    left,
    y,
    { width: contentW, lineGap: 3 }
  );
  y += 60;

  if (ac.planType && SUPERVISED_TYPES.has(ac.planType)) {
    doc.fontSize(9.5).fillColor(MUTED).text(
      '（団体監理型技能実習に係るものである場合）\n申請に係る技能実習計画の作成につき、申請者を指導したことを証明します。',
      left,
      y,
      { width: contentW, lineGap: 3 }
    );
    y += 40;
    doc.fontSize(10).fillColor(INK);
    boldText(doc, `監理団体　${supervisingOrg.name}`, left, y, { width: contentW });
  }

  pageFooter('第１面');

  // ============================================================
  // 第２面
  // ============================================================
  doc.addPage();
  y = PAGE_MARGIN;
  doc.fontSize(14).fillColor(INK);
  boldText(doc, '技能実習計画', left, y, { width: contentW, align: 'center' });
  y += 24;
  doc.fontSize(9.5).fillColor(MUTED).text(`作成日：${formatJpDate(ac.planCreationDate)}`, left, y, { width: contentW, align: 'right' });
  y += 20;

  sectionTitle('１ 申請者');
  fieldRow([
    ['①実習実施者届出受理番号', company ? company.companyNo : ''],
    ['⑤法人番号', company ? company.corporateNumber : ''],
  ]);
  fieldRow([['②氏名又は名称', company ? company.name : '']]);
  fieldRow([['③住所', company ? `${company.address}　（電話 ${company.phone || ''}）` : '']]);
  fieldRow([['④代表者の氏名', company ? company.representativeName : '']]);
  fieldRow([
    [
      '⑦業種',
      company
        ? `${company.industryMajorCode || ''} ${company.industryMajorName || ''} / ${company.industryMinorCode || ''} ${company.industryMinorName || ''}`
        : '',
    ],
  ]);

  // ⑥役員一覧
  if (y + 20 > doc.page.height - PAGE_MARGIN - 20) {
    doc.addPage();
    y = PAGE_MARGIN;
  }
  doc.fontSize(8.5).fillColor(INK).text('⑥役員の氏名、役職名及び住所', left, y);
  y += 14;
  const officerRows = officers.length ? officers : [{ name: '', title: '', address: '' }];
  const officerColW = [140, 100, contentW - 240];
  officerRows.forEach((o) => {
    const rowH = 18;
    if (y + rowH > doc.page.height - PAGE_MARGIN - 20) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    let cx = left;
    doc.lineWidth(0.75).strokeColor(LINE);
    [o.name, o.title, o.address].forEach((val, i) => {
      doc.rect(cx, y, officerColW[i], rowH).stroke();
      doc.fontSize(8.5).fillColor(INK).text(val || '', cx + 4, y + 5, { width: officerColW[i] - 8 });
      cx += officerColW[i];
    });
    y += rowH;
  });

  sectionTitle('２ 技能実習を行わせる事業所');
  fieldRow([['①名称', company ? company.name : '']]);
  fieldRow([['②所在地', company ? `${company.address}　（電話 ${company.phone || ''}）` : '']]);
  fieldRow([['③技能実習責任者', company ? company.trainingManagerName : '']]);
  fieldRow([
    ['④技能実習指導員', company ? company.skillInstructor : ''],
    ['⑤生活指導員', company ? company.lifeInstructor : ''],
  ]);

  sectionTitle('３ 技能実習生');
  fieldRow([['①氏名（ローマ字）', worker ? worker.name : '']]);
  fieldRow([
    ['②国籍（国又は地域）', worker ? worker.nationality : ''],
    ['③生年月日・年齢・性別', worker ? `${formatJpDate(worker.dob)}（${calcAge(worker.dob)}歳・${worker.gender || ''}）` : ''],
  ]);
  fieldRow([['④帰国（予定）期間', worker ? `${formatJpDate(worker.contractStartDate)} ～ ${formatJpDate(worker.contractEndDate)}` : '']]);

  sectionTitle('４ 技能実習の区分');
  fieldRow([['区分', ac.planType ? PLAN_TYPE_LABELS[ac.planType] : '']]);

  sectionTitle('５ 技能実習の内容');
  fieldRow([
    ['①コード番号', ac.jobCategoryCode],
    ['職種名', ac.jobCategoryName],
    ['作業名', ac.workName],
  ]);
  if (ac.jobCategoryFreeText) fieldRow([['②移行対象職種以外の内容', ac.jobCategoryFreeText]]);

  sectionTitle('６ 技能実習の目標');
  fieldRow([
    ['目標', ac.trainingGoalType],
    ['内容（試験名・級 等）', ac.trainingGoalDetail],
  ]);

  if (ac.planType && GEN_2_3_TYPES.has(ac.planType)) {
    sectionTitle('７ 前段階の目標の達成状況');
    fieldRow([
      ['①達成状況', ac.priorStageGoalType],
      ['内容', ac.priorStageGoalDetail],
    ]);
    fieldRow([['②前段階の技能実習計画の認定番号', ac.priorApprovalNumber]]);
  }

  sectionTitle('８ 技能実習の期間及び時間数');
  fieldRow([['期間', `${formatJpDate(ac.trainingPeriodStart)} ～ ${formatJpDate(ac.trainingPeriodEnd)}`]]);
  fieldRow([
    ['入国後講習時間', ac.orientationHours ? `${ac.orientationHours} 時間` : ''],
    ['実習時間', ac.practicalHours ? `${ac.practicalHours} 時間` : ''],
  ]);

  if (ac.planType && SUPERVISED_TYPES.has(ac.planType)) {
    sectionTitle('９ 団体監理型技能実習');
    fieldRow([
      ['①監理団体の許可番号', supervisingOrg.licenseNumber],
      ['②許可の別', supervisingOrg.licenseType],
    ]);
    fieldRow([['③監理団体の名称', supervisingOrg.name]]);
    fieldRow([['④監理団体の住所', `〒${supervisingOrg.postalCode} ${supervisingOrg.address}　（電話 ${supervisingOrg.tel}）`]]);
    fieldRow([
      ['⑤代表者の氏名', supervisingOrg.representativeName],
      ['⑥監理責任者の氏名', supervisingOrg.supervisorName],
    ]);
    fieldRow([
      ['⑨計画指導担当者の氏名', ac.planGuidanceStaffName],
      ['⑩取次送出機関', sendingOrg ? sendingOrg.name : ''],
    ]);
    if (sendingOrg) {
      fieldRow([
        ['送出機関番号', sendingOrg.licenseNumber],
        ['整理番号', sendingOrg.authorizationNumber],
      ]);
    }
  }

  sectionTitle('１０ 技能実習生の待遇');
  fieldRow([
    ['①報酬（賃金）', worker ? `${worker.wageType || ''}　${worker.baseSalary ? worker.baseSalary.toLocaleString('ja-JP') + ' 円' : ''}` : ''],
    ['講習手当', worker && worker.trainingAllowance ? `${worker.trainingAllowance.toLocaleString('ja-JP')} 円` : ''],
  ]);
  fieldRow([['②雇用契約期間', worker ? `${formatJpDate(worker.contractStartDate)} ～ ${formatJpDate(worker.contractEndDate)}` : '']]);
  fieldRow([
    ['③労働時間', worker ? `${worker.workStartTime || ''} ～ ${worker.workEndTime || ''}` : ''],
    ['休憩', worker ? `${worker.breakStartTime || ''} ～ ${worker.breakEndTime || ''}` : ''],
  ]);
  fieldRow([
    ['④所定労働時間（年間）', worker && worker.annualWorkingHours ? `${worker.annualWorkingHours} 時間` : ''],
    ['所定労働時間（週平均）', worker ? worker.weeklyAverageWorkingHours : ''],
  ]);
  fieldRow([
    ['⑤休日', worker ? worker.holidays : ''],
    ['⑥休暇', worker ? worker.leaveInfo : ''],
  ]);
  fieldRow([['⑦宿泊施設', worker ? worker.dormitoryInfo : '']]);
  fieldRow([
    ['⑧食費', worker && worker.mealFee ? `${worker.mealFee.toLocaleString('ja-JP')} 円` : ''],
    ['居住費', worker && worker.housingFeeDeduction ? `${worker.housingFeeDeduction.toLocaleString('ja-JP')} 円` : ''],
    ['その他', worker && worker.otherFeeDeduction ? `${worker.otherFeeDeduction.toLocaleString('ja-JP')} 円` : ''],
  ]);

  sectionTitle('１１ 備考');
  longFieldRow('備考', ac.remarks);
  fieldRow([['過去１年以内の技能実習実施困難時届出書の提出有無', ac.hasDifficultyNotification]]);

  pageFooter('第２面');

  // ============================================================
  // 第７面
  // ============================================================
  doc.addPage();
  y = PAGE_MARGIN;
  doc.fontSize(14).fillColor(INK);
  boldText(doc, '欠格事由の確認', left, y, { width: contentW, align: 'center' });
  y += 30;

  doc.fontSize(9.5).fillColor(INK).text(
    '申請者は、外国人の技能実習の適正な実施及び技能実習生の保護に関する法律第10条各号に規定する欠格事由（法人の役員・' +
      '未成年者の法定代理人を含む）のいずれにも該当しないことを、下記のとおり誓約します。',
    left,
    y,
    { width: contentW, lineGap: 4 }
  );
  y += 60;

  doc.lineWidth(1).strokeColor(LINE).rect(left, y, 16, 16).stroke();
  doc.fontSize(10.5).fillColor(INK).text('　法第10条各号に規定する欠格事由のいずれにも該当しません。', left + 22, y);
  y += 40;

  doc.fontSize(8.5).fillColor(MUTED).text(
    '※ 第10条各号の具体的な内容（禁錮以上の刑に処せられた者、技能実習法・入管法等の違反による処分歴がある者、' +
      '暴力団関係者　等）は、省令様式第1号 第7面（機構HP掲載）を参照してください。本PDFでは申請者の誓約欄のみを' +
      '出力しています。',
    left,
    y,
    { width: contentW, lineGap: 3 }
  );

  pageFooter('第７面');
}

module.exports = { generateCertificationApplicationPdf };
