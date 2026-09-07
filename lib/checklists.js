// 在留資格の種類ごとの認定申請 必要書類チェックリスト（テンプレート）
const CHECKLIST_TEMPLATES = {
  技能実習: [
    '技能実習計画認定申請書',
    '技能実習生の名簿',
    '雇用契約書・雇用条件書',
    '重要事項説明書',
    '技能実習事業所の概要書',
    '実習体制に関する書面',
    '宿泊施設の概要',
    '帰国旅費確保に関する書面',
  ],
  育成就労: [
    '育成就労計画認定申請書',
    '育成就労者の名簿',
    '雇用契約書・雇用条件書',
    '重要事項説明書',
    '育成計画書（3年間）',
    '宿泊施設の概要',
    '帰国旅費確保に関する書面',
  ],
  特定技能: [
    '特定技能雇用契約書',
    '支援計画書',
    '支援委託契約書',
    '重要事項説明書',
    '転籍説明書面',
  ],
};

function getChecklistTemplate(statusType) {
  return CHECKLIST_TEMPLATES[statusType] || [];
}

function buildChecklist(statusType) {
  return getChecklistTemplate(statusType).map((label) => ({ label, done: false }));
}

module.exports = { CHECKLIST_TEMPLATES, getChecklistTemplate, buildChecklist };
