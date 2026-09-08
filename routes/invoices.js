const express = require('express');
const ExcelJS = require('exceljs');
const { invoices, invoiceItems, hostCompanies, workers, billingRates } = require('../db');
const { ISSUER } = require('../lib/invoiceSettings');

const router = express.Router();

const STATUSES = ['下書き', '発行済み', '支払済み'];
const TAX_CATEGORIES = ['taxable', 'exempt'];
const TAX_RATE = 0.1;

async function withTotals(invoice) {
  const items = await invoiceItems.listByInvoice(invoice.id);
  const company = await hostCompanies.get(invoice.hostCompanyId);
  return {
    ...invoice,
    companyName: company ? company.name : '',
    itemCount: items.length,
    totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
  };
}

// 明細の課税区分から「口座引落のご案内」の税額サマリーを計算する。
// unitPrice/amount は税込金額として扱う（例: 33,000円/月＝税込）ため、
// 内消費税は課税対象額から逆算する（対象額 - 対象額÷1.1）。
function computeTaxSummary(items) {
  let taxableTotal = 0;
  let exemptTotal = 0;
  for (const item of items) {
    if (item.taxCategory === 'exempt') exemptTotal += item.amount;
    else taxableTotal += item.amount;
  }
  const taxAmount = Math.round(taxableTotal - taxableTotal / (1 + TAX_RATE));
  return {
    taxExemptTotal: exemptTotal,
    taxableTotal,
    taxAmount,
    grandTotal: taxableTotal + exemptTotal,
  };
}

router.get('/statuses', (req, res) => res.json(STATUSES));

router.get('/', async (req, res) => {
  const { hostCompanyId } = req.query;
  let list = await invoices.list();
  if (hostCompanyId) list = list.filter((inv) => inv.hostCompanyId === Number(hostCompanyId));

  // 件数分だけ .get() で問い合わせるとTursoへの通信が積み重なって遅くなるため、
  // 明細・企業をまとめて取得してからMapで引く。
  const [allItems, allCompanies] = await Promise.all([invoiceItems.list(), hostCompanies.list()]);
  const itemsByInvoiceId = new Map();
  for (const item of allItems) {
    if (!itemsByInvoiceId.has(item.invoiceId)) itemsByInvoiceId.set(item.invoiceId, []);
    itemsByInvoiceId.get(item.invoiceId).push(item);
  }
  const companyById = new Map(allCompanies.map((c) => [c.id, c]));

  res.json(
    list.map((invoice) => {
      const items = itemsByInvoiceId.get(invoice.id) || [];
      const company = companyById.get(invoice.hostCompanyId);
      return {
        ...invoice,
        companyName: company ? company.name : '',
        itemCount: items.length,
        totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
      };
    })
  );
});

router.get('/:id', async (req, res) => {
  const invoice = await invoices.get(Number(req.params.id));
  if (!invoice) return res.status(404).json({ error: '請求書が見つかりません。' });

  const items = await invoiceItems.listByInvoice(invoice.id);
  const itemsWithWorkerName = await Promise.all(
    items.map(async (item) => {
      const worker = item.workerId ? await workers.get(item.workerId) : null;
      return {
        ...item,
        taxCategory: item.taxCategory || 'taxable',
        workerName: worker ? worker.name : '',
        workerGeneration: worker ? worker.generation : '',
        workerContractStartDate: worker ? worker.contractStartDate : '',
        workerContractEndDate: worker ? worker.contractEndDate : '',
      };
    })
  );
  const company = await hostCompanies.get(invoice.hostCompanyId);

  res.json({
    ...(await withTotals(invoice)),
    items: itemsWithWorkerName,
    ...computeTaxSummary(itemsWithWorkerName),
    invoiceNumber: String(invoice.id).padStart(4, '0'),
    company: company
      ? { id: company.id, name: company.name, companyNo: company.companyNo, address: company.address }
      : null,
    issuer: ISSUER,
  });
});

// 受入企業を選択すると、その企業に在籍する対象者ごとに固定料金の明細を自動生成する
router.post('/', async (req, res) => {
  const { hostCompanyId, billingMonth, issueDate, dueDate, notes } = req.body;
  const errors = [];
  if (!hostCompanyId) errors.push('受入企業を選択してください。');
  if (!billingMonth) errors.push('請求月を入力してください。');
  if (errors.length) return res.status(400).json({ errors });

  const company = await hostCompanies.get(Number(hostCompanyId));
  if (!company) return res.status(400).json({ errors: ['受入企業が見つかりません。'] });

  const invoice = await invoices.insert({
    hostCompanyId: Number(hostCompanyId),
    billingMonth,
    issueDate: issueDate || '',
    dueDate: dueDate || '',
    status: STATUSES[0],
    notes: (notes || '').trim(),
  });

  const rates = await billingRates.list();
  const rateMap = Object.fromEntries(rates.map((r) => [r.visaType, r.monthlyFee]));
  const companyWorkers = (await workers.list()).filter((w) => w.hostCompanyId === company.id);

  for (const worker of companyWorkers) {
    const unitPrice = rateMap[worker.visaType] || 0;
    await invoiceItems.insert({
      invoiceId: invoice.id,
      workerId: worker.id,
      itemType: 'fixed',
      description: `${worker.name} 監理費（${worker.visaType}）`,
      quantity: 1,
      unitPrice,
      amount: unitPrice,
      taxCategory: 'taxable',
    });
  }

  res.status(201).json(await withTotals(invoice));
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await invoices.get(id);
  if (!existing) return res.status(404).json({ error: '請求書が見つかりません。' });

  const record = {
    hostCompanyId: existing.hostCompanyId,
    billingMonth: req.body.billingMonth || existing.billingMonth,
    issueDate: req.body.issueDate ?? existing.issueDate,
    dueDate: req.body.dueDate ?? existing.dueDate,
    status: req.body.status || existing.status,
    notes: (req.body.notes ?? existing.notes ?? '').toString().trim(),
  };
  const updated = await invoices.update(id, record);
  res.json(await withTotals(updated));
});

router.delete('/:id', async (req, res) => {
  const deleted = await invoices.remove(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: '請求書が見つかりません。' });
  res.json({ ok: true });
});

router.post('/:id/items', async (req, res) => {
  const invoiceId = Number(req.params.id);
  const invoice = await invoices.get(invoiceId);
  if (!invoice) return res.status(404).json({ error: '請求書が見つかりません。' });

  const description = (req.body.description || '').trim();
  if (!description) return res.status(400).json({ errors: ['項目名を入力してください。'] });

  const quantity = Number(req.body.quantity) || 1;
  const unitPrice = Number(req.body.unitPrice) || 0;
  const taxCategory = TAX_CATEGORIES.includes(req.body.taxCategory) ? req.body.taxCategory : 'taxable';

  const item = await invoiceItems.insert({
    invoiceId,
    workerId: req.body.workerId ? Number(req.body.workerId) : null,
    itemType: 'additional',
    description,
    quantity,
    unitPrice,
    amount: quantity * unitPrice,
    taxCategory,
  });
  res.status(201).json(item);
});

router.put('/:id/items/:itemId', async (req, res) => {
  const invoiceId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const existing = await invoiceItems.get(itemId);
  if (!existing || existing.invoiceId !== invoiceId) {
    return res.status(404).json({ error: '明細が見つかりません。' });
  }

  const description = (req.body.description ?? existing.description).toString().trim();
  const quantity = req.body.quantity !== undefined ? Number(req.body.quantity) : existing.quantity;
  const unitPrice = req.body.unitPrice !== undefined ? Number(req.body.unitPrice) : existing.unitPrice;
  const taxCategory = TAX_CATEGORIES.includes(req.body.taxCategory)
    ? req.body.taxCategory
    : existing.taxCategory || 'taxable';

  const updated = await invoiceItems.update(itemId, {
    invoiceId,
    workerId: existing.workerId,
    itemType: existing.itemType,
    description,
    quantity,
    unitPrice,
    amount: quantity * unitPrice,
    taxCategory,
  });
  res.json(updated);
});

router.delete('/:id/items/:itemId', async (req, res) => {
  const invoiceId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const existing = await invoiceItems.get(itemId);
  if (!existing || existing.invoiceId !== invoiceId) {
    return res.status(404).json({ error: '明細が見つかりません。' });
  }
  await invoiceItems.remove(itemId);
  res.json({ ok: true });
});

// 簡易Excel出力（正式な請求書テンプレートは別途対応予定）
router.get('/:id/export', async (req, res) => {
  const invoice = await invoices.get(Number(req.params.id));
  if (!invoice) return res.status(404).json({ error: '請求書が見つかりません。' });
  const full = await withTotals(invoice);
  const items = await invoiceItems.listByInvoice(invoice.id);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('請求書');
  sheet.getColumn(1).width = 30;
  sheet.getColumn(2).width = 10;
  sheet.getColumn(3).width = 14;
  sheet.getColumn(4).width = 14;

  sheet.mergeCells('A1:D1');
  sheet.getCell('A1').value = `請求書（${full.companyName} / ${full.billingMonth}）`;
  sheet.getCell('A1').font = { bold: true, size: 14 };

  sheet.addRow(['発行日', full.issueDate, '支払期限', full.dueDate]);
  sheet.addRow([]);
  const headerRow = sheet.addRow(['項目', '数量', '単価', '金額']);
  headerRow.font = { bold: true };

  items.forEach((item) => {
    sheet.addRow([item.description, item.quantity, item.unitPrice, item.amount]);
  });

  sheet.addRow([]);
  const totalRow = sheet.addRow(['合計', '', '', full.totalAmount]);
  totalRow.font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=invoice_${full.id}.xlsx`);
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
