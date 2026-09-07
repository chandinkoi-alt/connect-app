const express = require('express');
const cors = require('cors');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Biểu thuế TNCN lũy tiến từng phần (thu nhập tính thuế hàng tháng, VNĐ)
const TAX_BRACKETS = [
  { upTo: 5_000_000, rate: 0.05 },
  { upTo: 10_000_000, rate: 0.10 },
  { upTo: 18_000_000, rate: 0.15 },
  { upTo: 32_000_000, rate: 0.20 },
  { upTo: 52_000_000, rate: 0.25 },
  { upTo: 80_000_000, rate: 0.30 },
  { upTo: Infinity, rate: 0.35 },
];

const INSURANCE_RATE = 0.105; // BHXH 8% + BHYT 1.5% + BHTN 1% (phần người lao động đóng)
const SELF_DEDUCTION = 11_000_000; // Giảm trừ gia cảnh bản thân
const DEPENDENT_DEDUCTION = 4_400_000; // Giảm trừ mỗi người phụ thuộc

function calcProgressiveTax(taxableIncome) {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const bracket of TAX_BRACKETS) {
    if (taxableIncome <= lower) break;
    const amountInBracket = Math.min(taxableIncome, bracket.upTo) - lower;
    tax += amountInBracket * bracket.rate;
    lower = bracket.upTo;
  }
  return Math.round(tax);
}

function calcSalary(input) {
  const name = input.name || '';
  const baseSalary = Number(input.baseSalary) || 0;
  const standardDays = Number(input.standardDays) || 26;
  const actualDays = Number(input.actualDays) || 0;
  const overtimeHours = Number(input.overtimeHours) || 0;
  const overtimeRate = Number(input.overtimeRate) || 1.5;
  const allowance = Number(input.allowance) || 0;
  const dependents = Number(input.dependents) || 0;

  const dailyRate = standardDays > 0 ? baseSalary / standardDays : 0;
  const hourlyRate = dailyRate / 8;
  const actualSalary = dailyRate * actualDays;
  const overtimePay = hourlyRate * overtimeRate * overtimeHours;
  const grossIncome = actualSalary + overtimePay + allowance;

  const insurance = Math.round(baseSalary * INSURANCE_RATE);
  const totalDeduction = SELF_DEDUCTION + dependents * DEPENDENT_DEDUCTION;
  const taxableIncome = Math.max(0, grossIncome - insurance - totalDeduction);
  const tax = calcProgressiveTax(taxableIncome);
  const netSalary = Math.round(grossIncome - insurance - tax);

  return {
    name,
    baseSalary,
    standardDays,
    actualDays,
    overtimeHours,
    allowance,
    dependents,
    dailyRate: Math.round(dailyRate),
    actualSalary: Math.round(actualSalary),
    overtimePay: Math.round(overtimePay),
    grossIncome: Math.round(grossIncome),
    insurance,
    taxableIncome: Math.round(taxableIncome),
    tax,
    netSalary,
  };
}

let employees = [];
let nextId = 1;

app.get('/health', (req, res) => res.send('OK'));

app.get('/api/employees', (req, res) => {
  res.json(employees);
});

app.post('/api/employees', (req, res) => {
  const result = calcSalary(req.body);
  const record = { id: nextId++, ...result };
  employees.push(record);
  res.status(201).json(record);
});

app.delete('/api/employees/:id', (req, res) => {
  const id = Number(req.params.id);
  const before = employees.length;
  employees = employees.filter((e) => e.id !== id);
  if (employees.length === before) {
    return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
  }
  res.json({ ok: true });
});

app.post('/api/calculate', (req, res) => {
  res.json(calcSalary(req.body));
});

app.get('/api/export', async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Bảng lương');
  sheet.columns = [
    { header: 'Họ tên', key: 'name', width: 20 },
    { header: 'Lương cơ bản', key: 'baseSalary', width: 15 },
    { header: 'Ngày công thực tế', key: 'actualDays', width: 15 },
    { header: 'Giờ tăng ca', key: 'overtimeHours', width: 12 },
    { header: 'Phụ cấp', key: 'allowance', width: 12 },
    { header: 'Số người phụ thuộc', key: 'dependents', width: 15 },
    { header: 'Tổng thu nhập', key: 'grossIncome', width: 15 },
    { header: 'Bảo hiểm', key: 'insurance', width: 12 },
    { header: 'Thu nhập chịu thuế', key: 'taxableIncome', width: 15 },
    { header: 'Thuế TNCN', key: 'tax', width: 12 },
    { header: 'Lương thực nhận', key: 'netSalary', width: 15 },
  ];
  sheet.getRow(1).font = { bold: true };
  employees.forEach((e) => sheet.addRow(e));

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename=bang_luong.xlsx');
  await workbook.xlsx.write(res);
  res.end();
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = { calcSalary, calcProgressiveTax };
