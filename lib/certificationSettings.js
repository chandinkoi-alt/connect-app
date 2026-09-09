// 技能実習計画認定申請書 第2面「９ 団体監理型技能実習」に印字する、
// 監理団体（コネクト協同組合自身）の固定情報。申請ごとに変わらないため、
// DBではなくここで一元管理する（lib/invoiceSettings.js のISSUERと同様の方針）。
//
// 代表者・監理責任者の氏名など、まだ把握できていない項目は空欄のままにしてある。
// 判明次第この値を埋めること。
const SUPERVISING_ORG = {
  licenseNumber: '許1808000401',
  licenseType: '一般監理事業',
  name: 'コネクト協同組合',
  postalCode: '561-0851',
  address: '大阪府豊中市服部元町1-9-20　ユミヤビル3階',
  tel: '06-4866-5463',
  representativeName: '',
  supervisorName: '',
  branchName: '',
  branchPostalCode: '',
  branchAddress: '',
  branchTel: '',
};

module.exports = { SUPERVISING_ORG };
