const form = document.getElementById('salaryForm');
const previewResult = document.getElementById('previewResult');
const tableBody = document.getElementById('salaryTableBody');
const exportBtn = document.getElementById('exportBtn');

const formatVND = (n) => Number(n).toLocaleString('vi-VN') + ' đ';

function getFormData() {
  return {
    name: document.getElementById('name').value.trim(),
    baseSalary: Number(document.getElementById('baseSalary').value),
    standardDays: Number(document.getElementById('standardDays').value),
    actualDays: Number(document.getElementById('actualDays').value),
    overtimeHours: Number(document.getElementById('overtimeHours').value),
    overtimeRate: Number(document.getElementById('overtimeRate').value),
    allowance: Number(document.getElementById('allowance').value),
    dependents: Number(document.getElementById('dependents').value),
  };
}

function renderPreview(result) {
  previewResult.innerHTML = `
    <div class="row"><span>Tổng thu nhập</span><span>${formatVND(result.grossIncome)}</span></div>
    <div class="row"><span>Bảo hiểm (10.5%)</span><span>-${formatVND(result.insurance)}</span></div>
    <div class="row"><span>Thu nhập chịu thuế</span><span>${formatVND(result.taxableIncome)}</span></div>
    <div class="row"><span>Thuế TNCN</span><span>-${formatVND(result.tax)}</span></div>
    <div class="row total"><span>Lương thực nhận</span><span>${formatVND(result.netSalary)}</span></div>
  `;
}

function renderTable(employees) {
  if (!employees.length) {
    tableBody.innerHTML =
      '<tr class="empty-row"><td colspan="6">Chưa có nhân viên nào. Nhập thông tin bên trái để bắt đầu.</td></tr>';
    return;
  }
  tableBody.innerHTML = employees
    .map(
      (e) => `
      <tr>
        <td>${e.name}</td>
        <td>${formatVND(e.grossIncome)}</td>
        <td>${formatVND(e.insurance)}</td>
        <td>${formatVND(e.tax)}</td>
        <td><strong>${formatVND(e.netSalary)}</strong></td>
        <td><button class="link-delete" data-id="${e.id}">Xóa</button></td>
      </tr>`
    )
    .join('');
}

async function loadEmployees() {
  const res = await fetch('/api/employees');
  const employees = await res.json();
  renderTable(employees);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = getFormData();

  const previewRes = await fetch('/api/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const previewData = await previewRes.json();
  renderPreview(previewData);

  const res = await fetch('/api/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (res.ok) {
    await loadEmployees();
    form.reset();
    document.getElementById('standardDays').value = 26;
    document.getElementById('actualDays').value = 26;
    document.getElementById('overtimeRate').value = 1.5;
  }
});

tableBody.addEventListener('click', async (e) => {
  if (!e.target.matches('.link-delete')) return;
  const id = e.target.dataset.id;
  await fetch(`/api/employees/${id}`, { method: 'DELETE' });
  await loadEmployees();
});

exportBtn.addEventListener('click', () => {
  window.location.href = '/api/export';
});

loadEmployees();
