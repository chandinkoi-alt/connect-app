// 監査・面談の定期スケジュールを自動生成する。
//
// ルール:
//  - 監査（kansa）: 受入企業ごとに3ヶ月に1回。生成すると同時に、その企業に在籍する
//    （就労中の）全対象者との面談を同日で自動生成する（監査当日は全員面談する運用のため）。
//  - 面談（mendan）単独: 技能実習1号の対象者のみ、1ヶ月に1回。
//
// 各対象について「未完了（completedDate未設定）」の予定が既にある場合は重複生成しない。
// 次回分は、直近の完了日（無ければ予定日）を起点に自動計算する。履歴が無い場合は、
// 企業の受入開始日／対象者の入国日を起点にする（それも無ければ生成しない＝最初の1件は
// 手動登録してもらう）。
const { hostCompanies, workers, visitsAudits } = require('../db');

const AUDIT_INTERVAL_MONTHS = 3;
const MENDAN_INTERVAL_MONTHS = 1;

function addMonths(dateStr, months) {
  const d = dateStr ? new Date(dateStr) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function latestByDate(items, dateField) {
  return items
    .filter((i) => i[dateField])
    .sort((a, b) => (a[dateField] < b[dateField] ? 1 : -1))[0];
}

async function ensureAuditSchedule(companies, allWorkers, allVisits) {
  const created = [];
  for (const company of companies) {
    if (company.status !== 'active') continue;
    const companyAudits = allVisits.filter((v) => v.hostCompanyId === company.id && v.type === '監査');
    if (companyAudits.some((v) => !v.completedDate)) continue; // 未完了の予定が既にある

    const latest = latestByDate(companyAudits, 'completedDate') || latestByDate(companyAudits, 'scheduledDate');
    const nextDate = latest
      ? addMonths(latest.completedDate || latest.scheduledDate, AUDIT_INTERVAL_MONTHS)
      : addMonths(company.acceptanceStartDate, AUDIT_INTERVAL_MONTHS);
    if (!nextDate) continue;

    created.push(
      await visitsAudits.insert({
        hostCompanyId: company.id,
        workerId: null,
        type: '監査',
        scheduledDate: nextDate,
        completedDate: '',
        result: '',
        notes: '自動生成（3ヶ月ごとの定期監査）',
      })
    );

    const companyWorkers = allWorkers.filter((w) => w.hostCompanyId === company.id && w.currentStage === '就労中');
    for (const worker of companyWorkers) {
      created.push(
        await visitsAudits.insert({
          hostCompanyId: company.id,
          workerId: worker.id,
          type: '面談',
          scheduledDate: nextDate,
          completedDate: '',
          result: '',
          notes: '自動生成（監査同日の全員面談）',
        })
      );
    }
  }
  return created;
}

async function ensureMendanScheduleFor1Go(allWorkers, allVisits) {
  const created = [];
  const targets = allWorkers.filter((w) => w.visaType === '技能実習1号' && w.currentStage === '就労中');
  for (const worker of targets) {
    const workerMendan = allVisits.filter((v) => v.workerId === worker.id && v.type === '面談');
    if (workerMendan.some((v) => !v.completedDate)) continue; // 未完了の予定が既にある

    const latest = latestByDate(workerMendan, 'completedDate') || latestByDate(workerMendan, 'scheduledDate');
    const nextDate = latest
      ? addMonths(latest.completedDate || latest.scheduledDate, MENDAN_INTERVAL_MONTHS)
      : addMonths(worker.entryDate, MENDAN_INTERVAL_MONTHS);
    if (!nextDate) continue;

    created.push(
      await visitsAudits.insert({
        hostCompanyId: worker.hostCompanyId,
        workerId: worker.id,
        type: '面談',
        scheduledDate: nextDate,
        completedDate: '',
        result: '',
        notes: '自動生成（技能実習1号 月次面談）',
      })
    );
  }
  return created;
}

let lastRunAt = 0;
const THROTTLE_MS = 10 * 60 * 1000; // 短時間の連続呼び出しでの重複実行を避ける

async function ensureVisitSchedule({ force = false } = {}) {
  if (!force && Date.now() - lastRunAt < THROTTLE_MS) return { skipped: true, auditCreated: 0, mendanCreated: 0 };
  lastRunAt = Date.now();

  const [companies, allWorkers, allVisits] = await Promise.all([
    hostCompanies.list(),
    workers.list(),
    visitsAudits.list(),
  ]);

  const auditCreated = await ensureAuditSchedule(companies, allWorkers, allVisits);
  // 監査と同時に生成した面談も、1号の月次判定に反映させるため一覧を取り直す
  const refreshedVisits = await visitsAudits.list();
  const mendanCreated = await ensureMendanScheduleFor1Go(allWorkers, refreshedVisits);

  return { skipped: false, auditCreated: auditCreated.length, mendanCreated: mendanCreated.length };
}

module.exports = { ensureVisitSchedule };
