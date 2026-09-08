// ローカル/一回限りのテスト用CLI: node scripts/importExcel.js <path-to-xlsx>
const fs = require('fs');
const { startImport } = require('../lib/excelImport');

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('使い方: node scripts/importExcel.js <path-to-xlsx>');
    process.exit(1);
  }
  const buffer = fs.readFileSync(filePath);
  const { summary, promise } = startImport(buffer);
  await promise;
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
