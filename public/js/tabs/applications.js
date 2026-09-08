const TabApplications = {
  statuses: [],
  statusTypes: [],
  workers: [],

  async render(container) {
    container.innerHTML = `
      <section class="card">
        <div class="card-title-row">
          <h2 class="card-title">認定申請</h2>
          <button class="btn btn-primary btn-small" id="addCaseBtn">＋ 新規申請案件</button>
        </div>
        <div class="filter-bar">
          <select id="filterStatus"><option value="">すべてのステータス</option></select>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>No.</th><th>対象者</th><th>受入企業</th><th>制度区分</th><th>段階</th><th>ステータス</th><th>提出期限</th><th>チェックリスト</th><th></th></tr>
            </thead>
            <tbody id="caseTableBody"><tr><td colspan="9">読み込み中...</td></tr></tbody>
          </table>
        </div>
      </section>
    `;

    [this.statuses, this.statusTypes, this.workers] = await Promise.all([
      api.get('/api/application-cases/statuses'),
      api.get('/api/workers/status-types'),
      api.get('/api/workers'),
    ]);

    const filterStatus = document.getElementById('filterStatus');
    filterStatus.innerHTML += this.statuses.map((s) => `<option value="${s}">${s}</option>`).join('');
    filterStatus.addEventListener('change', () => this.load());

    document.getElementById('addCaseBtn').addEventListener('click', () => this.openEditForm());
    await this.load();
  },

  async load() {
    const status = document.getElementById('filterStatus').value;
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    const cases = await api.get(`/api/application-cases?${params.toString()}`);
    const tbody = document.getElementById('caseTableBody');
    if (!cases.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="9">申請案件が登録されていません。</td></tr>';
      return;
    }
    tbody.innerHTML = cases
      .map((c) => {
        const done = c.checklist.filter((i) => i.done).length;
        return `
        <tr>
          <td>${c.workerPersonalNo ?? '－'}</td>
          <td>${escapeHtml(c.workerName)}</td>
          <td>${escapeHtml(c.companyName)}</td>
          <td>${escapeHtml(c.statusType)}</td>
          <td>${escapeHtml(c.stage) || '－'}</td>
          <td><span class="badge badge-${c.status === '認定済み' ? 'ok' : c.status === '追加書類対応中' ? 'warning' : 'unknown'}">${escapeHtml(c.status)}</span></td>
          <td>${escapeHtml(c.dueDate) || '－'}</td>
          <td>${done}/${c.checklist.length}</td>
          <td class="row-actions">
            <button class="link-btn link-edit" data-id="${c.id}" data-action="edit">開く</button>
            <button class="link-btn link-delete" data-id="${c.id}" data-action="delete">削除</button>
          </td>
        </tr>`;
      })
      .join('');

    tbody.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        if (btn.dataset.action === 'edit') this.openEditForm(cases.find((c) => c.id === id));
        else this.remove(id);
      });
    });
  },

  openEditForm(item) {
    const isEdit = !!item;
    const workerOptions = this.workers
      .map((w) => `<option value="${w.id}" ${item && item.workerId === w.id ? 'selected' : ''}>${w.personalNo ? 'No.' + w.personalNo + ' ' : ''}${escapeHtml(w.name)}（${escapeHtml(w.companyName)}）</option>`)
      .join('');
    const statusTypeOptions = this.statusTypes
      .map((s) => `<option value="${s}" ${item && item.statusType === s ? 'selected' : ''}>${s}</option>`)
      .join('');
    const statusOptions = this.statuses
      .map((s) => `<option value="${s}" ${item && item.status === s ? 'selected' : ''}>${s}</option>`)
      .join('');

    const checklistHtml = item
      ? `
      <h4 class="section-title">必要書類チェックリスト</h4>
      <ul class="checklist" id="checklistList">
        ${item.checklist
          .map(
            (c, i) => `
          <li>
            <label><input type="checkbox" data-index="${i}" ${c.done ? 'checked' : ''}> ${escapeHtml(c.label)}</label>
          </li>`
          )
          .join('')}
      </ul>`
      : '';

    Modal.open(
      isEdit ? '認定申請 編集' : '認定申請 新規登録',
      `
      <form id="caseForm">
        <div class="form-group"><label>対象者 *</label><select id="f_workerId" required ${isEdit ? 'disabled' : ''}><option value="">選択してください</option>${workerOptions}</select></div>
        <div class="form-row">
          <div class="form-group"><label>制度区分 *</label><select id="f_statusType" required><option value="">選択</option>${statusTypeOptions}</select></div>
          <div class="form-group"><label>段階</label><input id="f_stage" value="${item ? escapeHtml(item.stage) : ''}" placeholder="初回申請・更新申請 等"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>ステータス</label><select id="f_status">${statusOptions}</select></div>
          <div class="form-group"><label>提出期限</label><input id="f_dueDate" type="date" value="${item ? item.dueDate || '' : ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>提出日</label><input id="f_submittedDate" type="date" value="${item ? item.submittedDate || '' : ''}"></div>
          <div class="form-group"><label>認定日</label><input id="f_approvedDate" type="date" value="${item ? item.approvedDate || '' : ''}"></div>
        </div>
        <div class="form-group"><label>備考</label><input id="f_notes" value="${item ? escapeHtml(item.notes) : ''}"></div>
        <div id="formErrors" class="alert-error" hidden></div>
        <button type="submit" class="btn btn-primary">${isEdit ? '更新する' : '登録する'}</button>
      </form>
      ${checklistHtml}
    `
    );

    if (isEdit) {
      document.getElementById('checklistList').querySelectorAll('input[type=checkbox]').forEach((cb) => {
        cb.addEventListener('change', async () => {
          await api.put(`/api/application-cases/${item.id}/checklist`, { index: Number(cb.dataset.index), done: cb.checked });
          await this.load();
        });
      });
    }

    document.getElementById('caseForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = (id) => document.getElementById(id).value;
      const body = {
        workerId: isEdit ? item.workerId : val('f_workerId'),
        statusType: val('f_statusType'),
        stage: val('f_stage'),
        status: val('f_status'),
        dueDate: val('f_dueDate'),
        submittedDate: val('f_submittedDate'),
        approvedDate: val('f_approvedDate'),
        notes: val('f_notes'),
      };
      try {
        if (isEdit) await api.put(`/api/application-cases/${item.id}`, body);
        else await api.post('/api/application-cases', body);
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
    if (!confirm('この申請案件を削除しますか？')) return;
    await api.del(`/api/application-cases/${id}`);
    await this.load();
  },
};
