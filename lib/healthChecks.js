// 特殊健康診断（労働安全衛生法に基づく特定業務従事者向け）の対象業務リスト
const SPECIAL_HEALTH_CHECK_TYPES = [
  '深夜業務',
  '有機溶剤業務',
  '特定化学物質業務',
  '粉じん作業',
  '騒音作業',
  '高圧室内業務',
];

function buildSpecialHealthChecks() {
  return SPECIAL_HEALTH_CHECK_TYPES.map((label) => ({ label, applicable: false, lastExamDate: '' }));
}

module.exports = { SPECIAL_HEALTH_CHECK_TYPES, buildSpecialHealthChecks };
