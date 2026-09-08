// 請求書（口座引落のご案内）に印字する発行元（コネクト協同組合）の固定情報。
// 請求書ごとに変わらないため、DBではなくここで一元管理する。
const ISSUER = {
  name: 'コネクト協同組合',
  postalCode: '561-0851',
  address: '大阪府豊中市服部元町1-9-20　ユミヤビル3階',
  tel: '06-4866-5463',
  fax: '06-4866-5473',
  registrationNumber: 'T9-1209-0500-5536',
  bankAccountType: '普通',
  bankAccountMasked: '＊＊＊＊637',
  bankAccountNote: '（下3ケタのみ表示しております）',
};

module.exports = { ISSUER };
