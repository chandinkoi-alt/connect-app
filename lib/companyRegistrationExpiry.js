// 受入企業の登録・許認可のうち、36協定と責任者講習は元のExcel台帳に有効期限の列が
// 無く、受講日・締結日しか記録されていなかった。どちらも法令上の更新周期が決まって
// いるため、期限が未入力の場合はその周期から実質的な期限日を計算する
// （36協定＝届出から1年、技能実習責任者講習＝受講から3年ごとに再受講が必要）。
// 建設業許可はExcel側に期限日そのものがあるため、そのまま使う。
const RENEWAL_YEARS_BY_LABEL = {
  '36協定': 1,
  '責任者講習受講日': 3,
};

function addYears(dateStr, years) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function getEffectiveExpiryDate(reg) {
  if (reg.expiryDate) return reg.expiryDate;
  const years = RENEWAL_YEARS_BY_LABEL[reg.label];
  if (years && reg.issueDate) return addYears(reg.issueDate, years);
  return '';
}

module.exports = { getEffectiveExpiryDate };
