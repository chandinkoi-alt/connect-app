const TabSendingOrgs = {
  orgs: [],

  async render(container) {
    container.innerHTML = `
      <section class="stats-bar" id="orgStatsBar"></section>
      <section class="card">
        <div class="card-title-row">
          <h2 class="card-title">送出機関</h2>
          <button class="btn btn-primary btn-small" id="addOrgBtn">＋ 新規登録</button>
        </div>
        <div class="filter-bar">
          <input type="text" id="orgSearchInput" placeholder="名称・国・認定番号で検索" />
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>名称</th><th>国</th><th>認定番号</th><th>担当者</th><th>連絡先</th>
                <th>在籍者数（内訳）</th><th>覚書(MOU)</th><th></th>
              </tr>
            </thead>
            <tbody id="orgTableBody">${loadingRowHtml(8)}</tbody>
          </table>
        </div>
      </section>
    `;
    document.getElementById('addOrgBtn').addEventListener('click', () => this.openForm());
    document.getElementById('orgSearchInput').addEventListener('input', debounce(() => this.renderTable(), 300));
    await this.load();
  },

  async load() {
    this.orgs = await api.get('/api/sending-orgs');
    this.renderStats();
    this.renderTable();
  },

  renderStats() {
    const totalOrgs = this.orgs.length;
    const totalWorkers = this.orgs.reduce((sum, o) => sum + o.totalWorkers, 0);
    const totalActive = this.orgs.reduce((sum, o) => sum + o.activeWorkers, 0);
    const totalAbsconded = this.orgs.reduce((sum, o) => sum + (o.byStage['失踪'] || 0), 0);
    document.getElementById('orgStatsBar').innerHTML = `
      <div class="stat-card"><div class="stat-value">${totalOrgs}</div><div class="stat-label">送出機関数</div></div>
      <div class="stat-card"><div class="stat-value">${totalWorkers}</div><div class="stat-label">送出人数（累計）</div></div>
      <div class="stat-card"><div class="stat-value">${totalActive}</div><div class="stat-label">現在の在籍者数</div></div>
      <div class="stat-card ${totalAbsconded ? 'expired' : ''}"><div class="stat-value">${totalAbsconded}</div><div class="stat-label">失踪者数</div></div>
    `;
  },

  renderTable() {
    const search = (document.getElementById('orgSearchInput')?.value || '').trim().toLowerCase();
    let orgs = this.orgs;
    if (search) {
      orgs = orgs.filter(
        (o) =>
          o.name.toLowerCase().includes(search) ||
          (o.country || '').toLowerCase().includes(search) ||
          (o.authorizationNumber || o.licenseNumber || '').toLowerCase().includes(search)
      );
    }
    orgs = [...orgs].sort((a, b) => b.totalWorkers - a.totalWorkers);

    const tbody = document.getElementById('orgTableBody');
    if (!tbody) return;
    if (!orgs.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="8">送出機関が登録されていません。</td></tr>';
      return;
    }
    const badgeClass = { ok: 'badge-ok', warning: 'badge-warning', expired: 'badge-expired', unknown: 'badge-unknown', muted: 'badge-muted' };
    tbody.innerHTML = orgs
      .map((o) => {
        const mou = o.mouStatus;
        const mouLabel = o.mouExpiryDate ? `${escapeHtml(o.mouExpiryDate)}` : '未設定';
        return `
      <tr>
        <td><a href="#" class="link-view" data-id="${o.id}"><strong>${escapeHtml(o.name)}</strong></a></td>
        <td>${escapeHtml(o.country)}</td>
        <td>${escapeHtml(o.authorizationNumber || o.licenseNumber) || '－'}</td>
        <td>${escapeHtml(o.contactPerson) || '－'}</td>
        <td>${escapeHtml(o.contactPhone) || escapeHtml(o.contactEmail) || '－'}</td>
        <td>${this.renderStageBreakdown(o)}</td>
        <td><span class="badge ${badgeClass[mou.level]}">${mouLabel}</span></td>
        <td class="row-actions">
          <button class="link-btn link-edit" data-id="${o.id}" data-action="edit">編集</button>
          <button class="link-btn link-delete" data-id="${o.id}" data-action="delete">削除</button>
        </td>
      </tr>`;
      })
      .join('');

    tbody.querySelectorAll('a.link-view').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this.openProfile(orgs.find((o) => o.id === Number(a.dataset.id)));
      });
    });
    tbody.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        if (btn.dataset.action === 'edit') this.openForm(orgs.find((o) => o.id === id));
        else this.remove(id);
      });
    });
  },

  renderStageBreakdown(o) {
    const parts = [
      ['就労中', 'badge-ok'],
      ['準備中', 'badge-unknown'],
      ['一時帰国中', 'badge-warning'],
      ['帰国済み', 'badge-muted'],
      ['失踪', 'badge-expired'],
    ]
      .filter(([stage]) => o.byStage[stage])
      .map(([stage, cls]) => `<span class="badge ${cls}" style="margin-right:4px;">${stage} ${o.byStage[stage]}</span>`)
      .join('');
    return `<strong>${o.totalWorkers}</strong>名 ${parts}`;
  },

  async openProfile(org) {
    const orgWorkers = await api.get(`/api/sending-orgs/${org.id}/workers`);
    const badgeClass = { ok: 'badge-ok', warning: 'badge-warning', expired: 'badge-expired', unknown: 'badge-unknown', muted: 'badge-muted' };

    Modal.open(
      `${org.name}（送出機関）`,
      `
      <div class="profile-grid">
        <div><label>国</label><div>${escapeHtml(org.country) || '－'}</div></div>
        <div><label>認定番号</label><div>${escapeHtml(org.authorizationNumber) || escapeHtml(org.licenseNumber) || '－'}</div></div>
        <div class="span-2"><label>所在地</label><div>${escapeHtml(org.address) || '－'}</div></div>
        <div><label>代表者</label><div>${escapeHtml(org.representativeName) || '－'}</div></div>
        <div><label>担当者</label><div>${escapeHtml(org.contactPerson) || '－'}</div></div>
        <div><label>電話番号</label><div>${escapeHtml(org.contactPhone) || '－'}</div></div>
        <div><label>メール</label><div>${escapeHtml(org.contactEmail) || '－'}</div></div>
        <div><label>覚書(MOU)締結日</label><div>${escapeHtml(org.mouSignedDate) || '－'}</div></div>
        <div><label>覚書(MOU)有効期限</label><div>${escapeHtml(org.mouExpiryDate) || '－'}（${org.mouStatus.label}）</div></div>
      </div>
      <div class="span-2"><label>備考</label><div>${escapeHtml(org.notes) || '－'}</div></div>

      <h4 class="section-title">在籍状況（${org.totalWorkers}名）</h4>
      <div>${this.renderStageBreakdown(org)}</div>

      <h4 class="section-title" style="margin-top:16px;">対象者一覧</h4>
      ${
        orgWorkers.length
          ? `<div class="table-wrap"><table>
              <thead><tr><th>氏名</th><th>受入企業</th><th>ステータス</th><th>在留期限</th></tr></thead>
              <tbody>
                ${orgWorkers
                  .map(
                    (w) => `
                  <tr>
                    <td>${escapeHtml(w.name)}</td>
                    <td>${escapeHtml(w.companyName) || '－'}</td>
                    <td>${escapeHtml(w.currentStage) || '－'}</td>
                    <td>${escapeHtml(w.visaExpiryDate) || '－'} <span class="badge ${badgeClass[w.visaStatus.level]}">${w.visaStatus.label}</span></td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table></div>`
          : '<div class="empty-hint">対象者がいません。</div>'
      }

      <div class="form-actions" style="margin-top:15px;">
        <button class="btn btn-primary" id="profileEditBtn">編集する</button>
      </div>
    `
    );

    const modalBox = document.querySelector('.modal-box');
    if (modalBox) modalBox.style.maxWidth = '760px';

    document.getElementById('profileEditBtn').addEventListener('click', () => this.openForm(org));
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
          <div class="form-group"><label>認定番号</label><input id="f_authorizationNumber" value="${org ? escapeHtml(org.authorizationNumber) : ''}"></div>
        </div>
        <div class="form-group"><label>所在地</label><input id="f_address" value="${org ? escapeHtml(org.address) : ''}"></div>
        <div class="form-row">
          <div class="form-group"><label>代表者</label><input id="f_representativeName" value="${org ? escapeHtml(org.representativeName) : ''}"></div>
          <div class="form-group"><label>許可番号（旧）</label><input id="f_licenseNumber" value="${org ? escapeHtml(org.licenseNumber) : ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>担当者</label><input id="f_contactPerson" value="${org ? escapeHtml(org.contactPerson) : ''}"></div>
          <div class="form-group"><label>電話番号</label><input id="f_contactPhone" value="${org ? escapeHtml(org.contactPhone) : ''}"></div>
        </div>
        <div class="form-group"><label>メール</label><input id="f_contactEmail" value="${org ? escapeHtml(org.contactEmail) : ''}"></div>
        <div class="form-row">
          <div class="form-group"><label>覚書(MOU)締結日</label><input id="f_mouSignedDate" type="date" value="${org ? org.mouSignedDate || '' : ''}"></div>
          <div class="form-group"><label>覚書(MOU)有効期限</label><input id="f_mouExpiryDate" type="date" value="${org ? org.mouExpiryDate || '' : ''}"></div>
        </div>
        <div class="form-group"><label>備考</label><input id="f_notes" value="${org ? escapeHtml(org.notes) : ''}"></div>
        <div id="formErrors" class="alert-error" hidden></div>
        <button type="submit" class="btn btn-primary">${isEdit ? '更新する' : '登録する'}</button>
      </form>
    `
    );

    document.getElementById('orgForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = (id) => document.getElementById(id).value;
      const body = {
        name: val('f_name'),
        country: val('f_country'),
        authorizationNumber: val('f_authorizationNumber'),
        licenseNumber: val('f_licenseNumber'),
        address: val('f_address'),
        representativeName: val('f_representativeName'),
        contactPerson: val('f_contactPerson'),
        contactPhone: val('f_contactPhone'),
        contactEmail: val('f_contactEmail'),
        mouSignedDate: val('f_mouSignedDate'),
        mouExpiryDate: val('f_mouExpiryDate'),
        notes: val('f_notes'),
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
    if (!(await ConfirmDialog.show('この送出機関を削除しますか？\nこの操作は取り消せません。'))) return;
    await api.del(`/api/sending-orgs/${id}`);
    await this.load();
  },
};
