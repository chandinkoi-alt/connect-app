const form = document.getElementById('workerForm');
const formTitle = document.getElementById('formTitle');
const submitBtn = document.getElementById('submitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const formErrors = document.getElementById('formErrors');
const workerIdInput = document.getElementById('workerId');

const tableBody = document.getElementById('workerTableBody');
const searchInput = document.getElementById('searchInput');
const filterVisaType = document.getElementById('filterVisaType');
const exportBtn = document.getElementById('exportBtn');

const FIELDS = [
  'name', 'nameKana', 'nationality', 'gender', 'dob', 'passportNumber',
  'residenceCardNumber', 'visaType', 'visaExpiryDate', 'entryDate',
  'companyName', 'jobCategory', 'contractStartDate', 'contractEndDate',
  'phone', 'notes',
];

const BADGE_CLASS = {
  ok: 'badge-ok',
  warning: 'badge-warning',
  expired: 'badge-expired',
  unknown: 'badge-unknown',
};

function getFormData() {
  const data = {};
  FIELDS.forEach((f) => {
    data[f] = document.getElementById(f).value;
  });
  return data;
}

function setFormData(worker) {
  FIELDS.forEach((f) => {
    document.getElementById(f).value = worker[f] || '';
  });
}

function resetForm() {
  form.reset();
  workerIdInput.value = '';
  formTitle.textContent = '新規登録';
  submitBtn.textContent = '登録する';
  cancelEditBtn.hidden = true;
  formErrors.hidden = true;
  formErrors.innerHTML = '';
}

function showErrors(errors) {
  formErrors.innerHTML = errors.map((e) => `<div>・${e}</div>`).join('');
  formErrors.hidden = false;
}

function buildQuery() {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
  if (filterVisaType.value) params.set('visaType', filterVisaType.value);
  return params.toString();
}

async function loadWorkers() {
  const query = buildQuery();
  const res = await fetch(`/api/workers${query ? '?' + query : ''}`);
  const workers = await res.json();
  renderTable(workers);
}

async function loadStats() {
  const res = await fetch('/api/stats');
  const stats = await res.json();
  document.getElementById('statTotal').textContent = stats.total;
  document.getElementById('statGinou').textContent = stats.ginouJisshu;
  document.getElementById('statTokutei').textContent = stats.tokuteiGinou;
  document.getElementById('statWarning').textContent = stats.expiringSoon;
  document.getElementById('statExpired').textContent = stats.expired;
}

function renderTable(workers) {
  if (!workers.length) {
    tableBody.innerHTML =
      '<tr class="empty-row"><td colspan="6">対象者が登録されていません。左のフォームから登録してください。</td></tr>';
    return;
  }

  tableBody.innerHTML = workers
    .map((w) => {
      const status = w.visaStatus;
      const badgeClass = BADGE_CLASS[status.level] || 'badge-unknown';
      const daysLabel =
        status.days === null
          ? ''
          : status.days < 0
          ? `（${Math.abs(status.days)}日超過）`
          : `（残り${status.days}日）`;
      return `
        <tr>
          <td>${escapeHtml(w.name)}</td>
          <td>${escapeHtml(w.visaType)}</td>
          <td>${escapeHtml(w.companyName)}</td>
          <td>${escapeHtml(w.visaExpiryDate)}</td>
          <td><span class="badge ${badgeClass}">${status.label}${daysLabel}</span></td>
          <td>
            <div class="row-actions">
              <button class="link-btn link-edit" data-action="edit" data-id="${w.id}">編集</button>
              <button class="link-btn link-doc" data-action="doc" data-id="${w.id}">書類</button>
              <button class="link-btn link-delete" data-action="delete" data-id="${w.id}">削除</button>
            </div>
          </td>
        </tr>`;
    })
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function refreshAll() {
  await Promise.all([loadWorkers(), loadStats()]);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = getFormData();
  const id = workerIdInput.value;

  const res = await fetch(id ? `/api/workers/${id}` : '/api/workers', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  const result = await res.json();
  if (!res.ok) {
    showErrors(result.errors || [result.error || '登録に失敗しました。']);
    return;
  }

  resetForm();
  await refreshAll();
});

cancelEditBtn.addEventListener('click', resetForm);

tableBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === 'delete') {
    if (!confirm('この対象者を削除しますか？')) return;
    await fetch(`/api/workers/${id}`, { method: 'DELETE' });
    await refreshAll();
  } else if (action === 'edit') {
    const res = await fetch(`/api/workers/${id}`);
    const worker = await res.json();
    setFormData(worker);
    workerIdInput.value = worker.id;
    formTitle.textContent = '編集';
    submitBtn.textContent = '更新する';
    cancelEditBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (action === 'doc') {
    window.location.href = `/api/workers/${id}/document`;
  }
});

searchInput.addEventListener('input', debounce(loadWorkers, 300));
filterVisaType.addEventListener('change', loadWorkers);
exportBtn.addEventListener('click', () => {
  window.location.href = '/api/export';
});

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

refreshAll();
