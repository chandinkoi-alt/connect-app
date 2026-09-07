const TabSendingOrgs = {
  async render(container) {
    container.innerHTML = `
      <section class="card">
        <div class="card-title-row">
          <h2 class="card-title">送出機関</h2>
          <button class="btn btn-primary btn-small" id="addOrgBtn">＋ 新規登録</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>名称</th><th>国</th><th>許可番号</th><th>担当者</th><th>電話番号</th><th>総人数</th><th>実習中</th><th>入国待ち</th><th></th></tr>
            </thead>
            <tbody id="orgTableBody"><tr><td colspan="9">読み込み中...</td></tr></tbody>
          </table>
        </div>
      </section>
    `;
    document.getElementById('addOrgBtn').addEventListener('click', () => this.openForm());
    await this.load();
  },

  async load() {
    const orgs = await api.get('/api/sending-orgs');
    const tbody = document.getElementById('orgTableBody');
    if (!tbody) return;
    if (!orgs.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="9">送出機関が登録されていません。</td></tr>';
      return;
    }
    tbody.innerHTML = orgs
      .map(
        (o) => `
      <tr>
        <td>${escapeHtml(o.name)}</td>
        <td>${escapeHtml(o.country)}</td>
        <td>${escapeHtml(o.licenseNumber)}</td>
        <td>${escapeHtml(o.contactPerson)}</td>
        <td>${escapeHtml(o.contactPhone)}</td>
        <td><strong>${o.totalWorkers}</strong></td>
        <td>${o.trainingCount}</td>
        <td>${o.waitingCount}</td>
        <td class="row-actions">
          <button class="link-btn link-edit" data-id="${o.id}" data-action="edit">編集</button>
          <button class="link-btn link-delete" data-id="${o.id}" data-action="delete">削除</button>
        </td>
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        if (btn.dataset.action === 'edit') this.openForm(orgs.find((o) => o.id === id));
        else this.remove(id);
      });
    });
  },

  openForm(org) {
    const isEdit = !!org;
    Modal.open(
      isEdit ? '送出機関 編集' : '送出機関 新規登録',
      `
      <form id="orgForm">
        <div class="form-group"><label>名称 *</label><input id="f_name" required value="${org ? escapeHtml(org.name) : ''}"></div>
        <div class="form-row">
          <div class="form-group"><label>国</label><input id="f_country" value="${org ? escapeHtml(org.country) : ''}"></div>
          <div class="form-group"><label>許可番号</label><input id="f_licenseNumber" value="${org ? escapeHtml(org.licenseNumber) : ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>担当者</label><input id="f_contactPerson" value="${org ? escapeHtml(org.contactPerson) : ''}"></div>
          <div class="form-group"><label>電話番号</label><input id="f_contactPhone" value="${org ? escapeHtml(org.contactPhone) : ''}"></div>
        </div>
        <div class="form-group"><label>メール</label><input id="f_contactEmail" value="${org ? escapeHtml(org.contactEmail) : ''}"></div>
        <div class="form-group"><label>備考</label><input id="f_notes" value="${org ? escapeHtml(org.notes) : ''}"></div>
        <div id="formErrors" class="alert-error" hidden></div>
        <button type="submit" class="btn btn-primary">${isEdit ? '更新する' : '登録する'}</button>
      </form>
    `
    );

    document.getElementById('orgForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        name: document.getElementById('f_name').value,
        country: document.getElementById('f_country').value,
        licenseNumber: document.getElementById('f_licenseNumber').value,
        contactPerson: document.getElementById('f_contactPerson').value,
        contactPhone: document.getElementById('f_contactPhone').value,
        contactEmail: document.getElementById('f_contactEmail').value,
        notes: document.getElementById('f_notes').value,
      };
      try {
        if (isEdit) await api.put(`/api/sending-orgs/${org.id}`, body);
        else await api.post('/api/sending-orgs', body);
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
    if (!confirm('この送出機関を削除しますか？')) return;
    await api.del(`/api/sending-orgs/${id}`);
    await this.load();
  },
};
