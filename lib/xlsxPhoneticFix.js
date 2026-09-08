// ExcelJSのストリーミング解析（WorkbookReader）には、ふりがな（フリガナ／ルビ）情報が
// 付いた共有文字列セルを正しく読めない重大な不具合がある。
//
// xlsxのxl/sharedStrings.xmlでは、ふりがな付きの文字列は
//   <si><t>失踪</t><rPh sb="0" eb="2"><t>シッソウ</t></rPh><phoneticPr .../></si>
// のように、本来の文字列<t>失踪</t>とは別に、ふりがな用の<rPh>要素内にも<t>シッソウ</t>が
// 入れ子で存在する。ExcelJSのストリーミング用SAXパーサーはこの入れ子を正しく認識できず、
// <si>内の最後に出現した<t>（＝ふりがなの方）を本来の値として誤って採用してしまう
// （実データで確認：全テキストセルの約4割に影響）。
//
// 通常の workbook.xlsx.load() はメモリを大量に消費する（数百MB規模）ため、ストリーミング
// 解析を使いたい。そこで、解析前に <rPh>...</rPh> 要素だけをXML文字列から取り除いておく
// ことで、この不具合を回避する（<rPh>を除去しても見た目のふりがな表示が消えるだけで、
// 本来のテキスト内容には影響しない）。
const JSZip = require('jszip');

const SHARED_STRINGS_PATH = 'xl/sharedStrings.xml';

async function stripPhoneticHints(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file(SHARED_STRINGS_PATH);
  if (!file) return buffer; // 共有文字列を使っていないファイルはそのまま
  const xml = await file.async('string');
  const cleaned = xml.replace(/<rPh\b[^>]*>[\s\S]*?<\/rPh>/g, '');
  if (cleaned === xml) return buffer; // ふりがなが無ければ変更不要
  zip.file(SHARED_STRINGS_PATH, cleaned);
  return zip.generateAsync({ type: 'nodebuffer' });
}

module.exports = { stripPhoneticHints };
