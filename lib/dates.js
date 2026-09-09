function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return null;
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function getUrgency(days, warningDays = 90) {
  if (days === null) return { label: '未設定', level: 'unknown', days: null };
  if (days < 0) return { label: '期限切れ', level: 'expired', days };
  if (days <= warningDays) return { label: '期限間近', level: 'warning', days };
  return { label: '正常', level: 'ok', days };
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

// 対象者の在留カード残存期間の警告表示専用。就労中の人だけを対象に、
// 4ヶ月を切ったら黄色（警告）、3ヶ月を切ったら赤（期限間近／期限切れ）にする。
// 就労中でない人（準備中・一時帰国中・帰国済み・失踪）は在留期限が過ぎていても
// 業務上の緊急対応が不要なため、警告色を出さない（ミュート表示）。
function getWorkerVisaUrgency(worker) {
  const days = getDaysUntil(worker.visaExpiryDate);
  if (days === null) return { label: '未設定', level: 'unknown', days: null };
  if (worker.currentStage !== '就労中') return { label: '－', level: 'muted', days };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(worker.visaExpiryDate);
  target.setHours(0, 0, 0, 0);

  if (target <= addMonths(today, 3)) return { label: days < 0 ? '期限切れ' : '期限間近', level: 'expired', days };
  if (target <= addMonths(today, 4)) return { label: '期限間近', level: 'warning', days };
  return { label: '正常', level: 'ok', days };
}

// 指定日が「今日から数えて◯ヶ月以内」かどうか（既に過ぎている日付は対象外＝false。
// それは別の「期限切れ」系アラートが担当するため、ここでは早期の準備喚起のみを扱う）。
function isWithinMonths(dateStr, months) {
  const days = getDaysUntil(dateStr);
  if (days === null || days < 0) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return target <= addMonths(today, months);
}

module.exports = { getDaysUntil, getUrgency, getWorkerVisaUrgency, isWithinMonths, addMonths };
