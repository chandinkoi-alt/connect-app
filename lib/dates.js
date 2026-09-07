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

module.exports = { getDaysUntil, getUrgency };
