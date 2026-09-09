// 実際に使用している請求書（口座引落のご案内）のPDF様式を、罫線・セル区切りまで
// なるべく忠実に再現するPDF生成。pdfkitで直接座標指定して描画する（HTMLの
// invoice-print.html と見た目を揃えているが、こちらはブラウザに依存しない
// サーバー側PDF出力専用）。日本語表示にはIPAゴシック（IPA Font License v1.0、
// 再頒布・組み込み可）を同梱して使用する。
const path = require('path');

const FONT_REGULAR = path.join(__dirname, '../fonts/ipag.ttf');

const PAGE_MARGIN = 40;
const INK = '#1a1a1a';
const MUTED = '#555555';
const LINE = '#333333';
const ROW_LINE = '#bbbbbb';
const HEADER_FILL = '#f2f2f2';

function formatJpDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return iso;
  return `${y}年${Number(m)}月${Number(d)}日`;
}

function yen(n) {
  return (n || 0).toLocaleString('ja-JP');
}

// 受入企業の住所は「〒999-9999 ○○県○○市...」の形で1フィールドに保存されている。
// サンプルの請求書では宛先側の郵便番号だけ「〒 999-9999」と1文字分空けて別行に
// なっているため、ここで分割して再現する（分割できない場合はそのまま1行で表示）。
function splitPostalAddress(address) {
  const m = String(address || '').match(/^〒\s*(\d{3}-\d{4})\s*(.*)$/);
  if (!m) return null;
  return { postal: m[1], rest: m[2] };
}

// IPAゴシックには太字がないため、同じ文字をごくわずかにずらして重ね描きし
// 疑似的に太く見せる（日本語フォントでよく使われる代替手段）。
function boldText(doc, str, x, y, opts) {
  doc.text(str, x, y, opts);
  doc.text(str, x + 0.35, y, opts);
}

function drawGrid(doc, x, y, colWidths, rowHeight, rowCount) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const totalHeight = rowHeight * rowCount;
  doc.lineWidth(1).strokeColor(LINE);
  // 横線
  for (let r = 0; r <= rowCount; r++) {
    doc.moveTo(x, y + r * rowHeight).lineTo(x + totalWidth, y + r * rowHeight).stroke();
  }
  // 縦線
  let cx = x;
  doc.moveTo(cx, y).lineTo(cx, y + totalHeight).stroke();
  for (const w of colWidths) {
    cx += w;
    doc.moveTo(cx, y).lineTo(cx, y + totalHeight).stroke();
  }
}

// data は routes/invoices.js の GET /:id と同じ形（items/company/issuer/税集計込み）。
function generateInvoicePdf(doc, data) {
  doc.registerFont('jp', FONT_REGULAR);
  doc.font('jp');

  const contentW = doc.page.width - PAGE_MARGIN * 2;
  const left = PAGE_MARGIN;
  const right = PAGE_MARGIN + contentW;
  let y = PAGE_MARGIN;

  // ---------- タイトル行 ----------
  doc.fontSize(21).fillColor(INK);
  boldText(doc, '口座引落のご案内', left, y, { width: contentW - 190 });

  doc.fontSize(10).fillColor(MUTED);
  doc.text(`発行日　${formatJpDate(data.issueDate)}`, right - 190, y + 3, { width: 190, align: 'right' });
  doc.text(`請求書番号：　${data.invoiceNumber}`, right - 190, y + 18, { width: 190, align: 'right' });

  y += 50;

  // ---------- 宛先（左）／発行元（右） ----------
  const headerTop = y;
  const company = data.company;
  doc.fontSize(11.5).fillColor(INK);
  if (company && company.address) {
    const split = splitPostalAddress(company.address);
    if (split) {
      doc.text(`〒 ${split.postal}`, left, y, { width: 280 });
      y += 17;
      doc.text(split.rest, left, y, { width: 280 });
    } else {
      doc.text(company.address, left, y, { width: 280 });
    }
    y += 18;
  }
  y += 16;
  doc.fontSize(17.5);
  const recipientNameWidth = doc.widthOfString(data.companyName || '');
  boldText(doc, data.companyName || '', left, y, { width: 220 });
  doc.fontSize(13).text('御中', left + Math.min(recipientNameWidth, 210) + 8, y + 2);
  y += 26;
  if (company && company.companyNo) {
    doc.fontSize(10).fillColor(MUTED).text(String(company.companyNo).padStart(3, '0'), left, y);
  }

  // 発行元ブロック（右側、宛先と同じ開始位置から）
  let ry = headerTop;
  const issuerX = left + 300;
  const issuerW = contentW - 300;
  const issuer = data.issuer;
  const logoHeight = 32;
  const logoWidth = logoHeight * (330 / 223);
  try {
    doc.image(path.join(__dirname, '../public/assets/logo.png'), issuerX, ry - 2, { height: logoHeight });
  } catch (e) {
    // ロゴ画像が読めない場合は文字のみで続行する
  }
  doc.fontSize(17).fillColor(INK);
  const nameX = issuerX + logoWidth + 8;
  const nameWidth = doc.widthOfString(issuer.name);
  boldText(doc, issuer.name, nameX, ry + 6, { width: issuerW - logoWidth - 8 });
  // 角印（実際の請求書の慣例に合わせ、会社名の右端に少し重なる位置に配置する）
  try {
    const stampSize = 48;
    doc.opacity(0.9).image(
      path.join(__dirname, '../public/assets/stamp.png'),
      nameX + nameWidth - 14,
      ry - 8,
      { width: stampSize, height: stampSize }
    );
    doc.opacity(1);
  } catch (e) {
    // 印影画像が読めない場合は省略して続行する
  }
  ry += 40;
  doc.fontSize(10).fillColor(MUTED);
  doc.text(`〒${issuer.postalCode}`, issuerX, ry, { width: issuerW });
  ry += 13;
  doc.text(issuer.address, issuerX, ry, { width: issuerW });
  ry += 13;
  doc.text(`tel ${issuer.tel}　fax ${issuer.fax}`, issuerX, ry, { width: issuerW });
  ry += 13;
  doc.text(`登録番号：${issuer.registrationNumber}`, issuerX, ry, { width: issuerW });

  y = Math.max(y, ry) + 26;

  // ---------- 口座引落日（左）／税額サマリー（右の表） ----------
  const summaryTop = y;
  doc.fontSize(11.5).fillColor(INK).text('口座引落日', left, y);
  y += 16;
  doc.fontSize(22);
  boldText(doc, formatJpDate(data.dueDate) || '－', left, y, { width: 220 });
  doc.moveTo(left, y + 27).lineTo(left + 220, y + 27).lineWidth(1.4).strokeColor(LINE).stroke();
  y += 33;
  doc.fontSize(9).fillColor(MUTED).text('金融機関が休日の場合は翌営業日になります。', left, y, { width: 240 });

  // 税額サマリー表（右）
  const sumColWidths = [95, 95, 95, 95];
  const sumX = right - sumColWidths.reduce((a, b) => a + b, 0);
  const sumY = summaryTop;
  const sumRowH = 22;
  drawGrid(doc, sumX, sumY, sumColWidths, sumRowH, 2);
  const sumLabels = ['課税対象外額', '課税対象額', '内消費税(10%)', '今回引落額'];
  const sumValues = [yen(data.taxExemptTotal), yen(data.taxableTotal), yen(data.taxAmount), yen(data.grandTotal)];
  let cx = sumX;
  doc.fontSize(9.5).fillColor(INK);
  sumColWidths.forEach((w, i) => {
    doc.rect(cx, sumY, w, sumRowH).fill(HEADER_FILL);
    doc.fillColor(INK).text(sumLabels[i], cx, sumY + 7, { width: w, align: 'center' });
    cx += w;
  });
  cx = sumX;
  doc.fontSize(11);
  sumColWidths.forEach((w, i) => {
    if (i === 3) {
      boldText(doc, sumValues[i], cx + 4, sumY + sumRowH + 5, { width: w - 8, align: 'right' });
    } else {
      doc.fillColor(INK).text(sumValues[i], cx + 4, sumY + sumRowH + 5, { width: w - 8, align: 'right' });
    }
    cx += w;
  });
  drawGrid(doc, sumX, sumY, sumColWidths, sumRowH, 2);

  y = Math.max(y + 8, sumY + sumRowH * 2 + 14);

  // ---------- 明細表（罫線グリッド。実データが少なくても下まで空欄行で埋める） ----------
  const itemColWidths = [28, 262, 45, 45, 65, 70];
  const tableX = left;
  const headerRowH = 18;
  const bodyRowH = 15.5;
  const footerReserve = 34; // 下部注記の高さ分は罫線を空けておく
  const maxTableBottom = doc.page.height - PAGE_MARGIN - footerReserve;

  doc.fontSize(8.5).fillColor(INK);
  const itemHeaderLabels = ['No.', '項　目', '区分', '数量', '単価', '金額'];
  cx = tableX;
  itemColWidths.forEach((w, i) => {
    doc.rect(cx, y, w, headerRowH).fill(HEADER_FILL);
    doc.fillColor(INK).text(itemHeaderLabels[i], cx + 3, y + 5, { width: w - 6, align: i <= 1 ? 'left' : 'center' });
    cx += w;
  });
  const tableTop = y;
  y += headerRowH;

  // 明細行を「本行＋（対象者情報があれば）補足行」の単位に展開する
  const rowUnits = [];
  (data.items || []).forEach((item, i) => {
    const taxLabel = item.taxCategory === 'exempt' ? '対象外' : '10%';
    rowUnits.push({
      type: 'main',
      cells: [String(i + 1), item.description, taxLabel, String(item.quantity), yen(item.unitPrice), yen(item.amount)],
    });
    if (item.workerName) {
      const period =
        item.workerContractStartDate || item.workerContractEndDate
          ? `　（${item.workerContractStartDate || '？'}～${item.workerContractEndDate || '？'}）`
          : '';
      rowUnits.push({
        type: 'sub',
        text: `${item.workerName}${item.workerGeneration ? '　' + item.workerGeneration : ''}${period}`,
      });
    }
  });

  const totalTableWidth = itemColWidths.reduce((a, b) => a + b, 0);
  let rowY = y;
  doc.fontSize(8.5);
  for (const row of rowUnits) {
    if (rowY + bodyRowH > maxTableBottom) break; // ページ内に収まる分だけ描画する
    cx = tableX;
    if (row.type === 'main') {
      row.cells.forEach((val, i) => {
        const align = i === 1 ? 'left' : i === 0 || i === 2 || i === 3 ? 'center' : 'right';
        doc.fillColor(INK).text(val, cx + 4, rowY + 4, { width: itemColWidths[i] - 8, align });
        cx += itemColWidths[i];
      });
    } else {
      doc.fillColor(MUTED).fontSize(8).text(row.text, tableX + itemColWidths[0] + 4, rowY + 3, {
        width: totalTableWidth - itemColWidths[0] - 8,
      });
      doc.fontSize(8.5);
    }
    rowY += bodyRowH;
  }
  // 残りは空欄の罫線行で下まで埋める（伝票としての体裁を保つ）
  const filledBottom = rowY;
  const remainingRows = Math.max(0, Math.floor((maxTableBottom - filledBottom) / bodyRowH));
  const gridBottom = filledBottom + remainingRows * bodyRowH;

  // グリッド線（ヘッダー含む全体）
  doc.lineWidth(1).strokeColor(LINE);
  doc.rect(tableX, tableTop, totalTableWidth, headerRowH + (rowY - y) + remainingRows * bodyRowH).stroke();
  doc.moveTo(tableX, tableTop + headerRowH).lineTo(tableX + totalTableWidth, tableTop + headerRowH).stroke();
  // 行の横線
  doc.strokeColor(ROW_LINE);
  for (let ly = y + bodyRowH; ly < gridBottom + 0.5; ly += bodyRowH) {
    doc.moveTo(tableX, ly).lineTo(tableX + totalTableWidth, ly).stroke();
  }
  // 列の縦線（No.列と項目列の右側のみ実線、以降も同じ太さで統一）
  doc.strokeColor(LINE);
  cx = tableX;
  itemColWidths.forEach((w) => {
    cx += w;
    doc.moveTo(cx, tableTop).lineTo(cx, gridBottom).stroke();
  });

  // ---------- 下部注記 ----------
  const footerY = doc.page.height - PAGE_MARGIN - 26;
  doc.moveTo(left, footerY - 8).lineTo(right, footerY - 8).lineWidth(1).strokeColor(LINE).stroke();
  doc.fontSize(9).fillColor(INK);
  boldText(doc, '貴社指定口座　※ 引落し日前日までにご入金をお願い致します。', left, footerY, { width: 340 });
  doc.fontSize(9).fillColor(MUTED);
  const bankAccountTypeDisplay = company && company.bankAccountLast3 ? company.bankAccountType || '普通' : issuer.bankAccountType;
  const bankAccountMaskedDisplay = company && company.bankAccountLast3 ? `＊＊＊＊${company.bankAccountLast3}` : issuer.bankAccountMasked;
  doc.text(
    `${bankAccountTypeDisplay}　${bankAccountMaskedDisplay}　${issuer.bankAccountNote}`,
    right - 260,
    footerY,
    { width: 260, align: 'right' }
  );
}

module.exports = { generateInvoicePdf };
