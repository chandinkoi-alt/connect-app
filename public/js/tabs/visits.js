const TabVisits = {
  types: [],
  workers: [],
  companies: [],

  async render(container) {
    container.innerHTML = `
      <section class="card">
        <div class="card-title-row">
          <h2 class="card-title">面談・監査（訪問指導・監査）</h2>
          <button class="btn btn-primary btn-small" id="addVisitBtn">＋ 新規登録</button>
        </div>
        <div class="filter-bar">
          <select id="filterType"><option value="">すべての種別</option></select>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>種別</th><th>対象者</th><th>受入企業</th><th>予定日</th><th>状態</th><th>結果</th><th></th></tr>
            </thead>
            <tbody id="visitTableBody"><tr><td colspan="7">読み込み中...</td></tr></tbody>
          </table>
        </div>
      </section>
    `;

    [this.types, this.workers, this.companies] = await Promise.all([
      api.get('/api/visits/types'),
      api.get('/api/workers'),
      api.get('/api/host-companies?status=active'),
    ]);

    const filterType = document.getElementById('filterType');
    filterType.innerHTML += this.types.map((t) => `<option value="${t}">${t}</option>`).join('');
    filterType.addEventListener('change', () => this.load());

    document.getElementById('addVisitBtn').addEventListener('click', () => this.openEditForm());
    await this.load();
  },

  async load() {
    const type = document.getElementById('filterType').value;
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    const visits = await api.get(`/api/visits?${params.toString()}`);
    const tbody = document.getElementById('visitTableBody');
    if (!visits.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">記録が登録されていません。</td></tr>';
      return;
    }
    const badgeClass = { ok: 'badge-ok', warning: 'badge-warning', expired: 'badge-expired', unknown: 'badge-unknown' };
    tbody.innerHTML = visits
      .map((v) => {
        const u = v.urgency;
        return `
        <tr>
          <td>${escapeHtml(v.type)}</td>
          <td>${escapeHtml(v.workerName) || '－'}</td>
          <td>${escapeHtml(v.companyName) || '－'}</td>
          <td>${escapeHtml(v.scheduledDate)}</td>
          <td><span class="badge ${badgeClass[u.level]}">${u.label}</span></td>
          <td>${escapeHtml(v.result) || '－'}</td>
          <td class="row-actions">
            <button class="link-btn link-edit" data-id="${v.id}" data-action="edit">編集</button>
            <button class="link-btn link-delete" data-id="${v.id}" data-action="delete">削除</button>
          </td>
        </tr>`;
      })
      .join('');

    tbody.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        if (btn.dataset.action === 'edit') this.openEditForm(visits.find((v) => v.id === id));
        else this.remove(id);
      });
    });
  },

  openEditForm(item) {
    const isEdit = !!item;
    const workerOptions = this.workers
      .map((w) => `<option value="${w.id}" ${item && item.workerId === w.id ? 'selected' : ''}>${escapeHtml(w.name)}</option>`)
      .join('');
    const companyOptions = this.companies
      .map((c) => `<option value="${c.id}" ${item && item.hostCompanyId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
      .join('');
    const typeOptions = this.types
      .map((t) => `<option value="${t}" ${item && item.type === t ? 'selected' : ''}>${t}</option>`)
      .join('');

    Modal.open(
      isEdit ? '面談・監査 編集' : '面談・監査 新規登録',
      `
      <form id="visitForm">
        <div class="form-group"><label>種別 *</label><select id="f_type" required>${typeOptions}</select></div>
        <div class="form-row">
          <div class="form-group"><label>対象者</label><select id="f_workerId"><option value="">選択</option>${workerOptions}</select></div>
          <div class="form-group"><label>受入企業</label><select id="f_hostCompanyId"><option value="">選択</option>${companyOptions}</select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>予定日 *</label><input id="f_scheduledDate" type="date" required value="${item ? item.scheduledDate || '' : ''}"></div>
          <div class="form-group"><label>実施日</label><input id="f_completedDate" type="date" value="${item ? item.completedDate || '' : ''}"></div>
        </div>
        <div class="form-group"><label>結果</label><input id="f_result" value="${item ? escapeHtml(item.result) : ''}"></div>
        <div class="form-group"><label>備考</label><input id="f_notes" value="${item ? escapeHtml(item.notes) : ''}"></div>
        <div id="formErrors" class="alert-error" hidden></div>
        <button type="submit" class="btn btn-primary">${isEdit ? '更新する' : '登録する'}</button>
      </form>
    `
    );

    document.getElementById('visitForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = (id) => document.getElementById(id).value;
      const body = {
        type: val('f_type'),
        workerId: val('f_workerId') || null,
        hostCompanyId: val('f_hostCompanyId') || null,
        scheduledDate: val('f_scheduledDate'),
        completedDate: val('f_completedDate'),
        result: val('f_result'),
        notes: val('f_notes'),
      };
      try {
        if (isEdit) await api.put(`/api/visits/${item.id}`, body);
        else await api.post('/api/visits', body);
        Modal.close();
        await this.load();
      } catch (err) {
        const el = document.getElementById('formErrors');
        el.textContent = formatErrors(err);
        el.hidden = false;
      }
    });
  },

  async remove(id) {
    if (!confirm('この記録を削除しますか？')) return;
    await api.del(`/api/visits/${id}`);
    await this.load();
  },
};
