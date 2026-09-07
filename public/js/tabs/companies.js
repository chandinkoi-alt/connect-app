const TabCompanies = {
  async render(container) {
    container.innerHTML = `
      <section class="card">
        <div class="card-title-row">
          <h2 class="card-title">受入企業360</h2>
          <button class="btn btn-primary btn-small" id="addCompanyBtn">＋ 新規登録</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>企業名</th><th>所在地</th><th>担当者</th><th>技能指導員</th><th>電話番号</th><th></th></tr>
            </thead>
            <tbody id="companyTableBody"><tr><td colspan="6">読み込み中...</td></tr></tbody>
          </table>
        </div>
      </section>
    `;
    document.getElementById('addCompanyBtn').addEventListener('click', () => this.openEditForm());
    await this.load();
  },

  async load() {
    const companies = await api.get('/api/host-companies?status=active');
    const tbody = document.getElementById('companyTableBody');
    if (!tbody) return;
    if (!companies.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">受入企業が登録されていません。</td></tr>';
      return;
    }
    tbody.innerHTML = companies
      .map(
        (c) => `
      <tr>
        <td><a href="#" class="link-view" data-id="${c.id}">${escapeHtml(c.name)}</a></td>
        <td>${escapeHtml(c.address)}</td>
        <td>${escapeHtml(c.contactPerson)}</td>
        <td>${escapeHtml(c.skillInstructor)}</td>
        <td>${escapeHtml(c.phone)}</td>
        <td class="row-actions">
          <button class="link-btn link-edit" data-id="${c.id}" data-action="edit">編集</button>
          <button class="link-btn link-delete" data-id="${c.id}" data-action="delete">削除</button>
        </td>
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('a.link-view').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this.openProfile(companies.find((c) => c.id === Number(a.dataset.id)));
      });
    });
    tbody.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        if (btn.dataset.action === 'edit') this.openEditForm(companies.find((c) => c.id === id));
        else this.remove(id);
      });
    });
  },

  openProfile(company) {
    Modal.open(
      `${company.name}（受入企業360）`,
      `
      <div class="profile-grid">
        <div><label>所在地</label><div>${escapeHtml(company.address) || '－'}</div></div>
        <div><label>担当者</label><div>${escapeHtml(company.contactPerson) || '－'}</div></div>
        <div><label>技能指導員</label><div>${escapeHtml(company.skillInstructor) || '－'}</div></div>
        <div><label>生活指導員</label><div>${escapeHtml(company.lifeInstructor) || '－'}</div></div>
        <div><label>電話番号</label><div>${escapeHtml(company.phone) || '－'}</div></div>
        <div class="span-2"><label>宿舎情報</label><div>${escapeHtml(company.dormitoryInfo) || '－'}</div></div>
        <div class="span-2"><label>備考</label><div>${escapeHtml(company.notes) || '－'}</div></div>
      </div>
      <button class="btn btn-primary" id="profileEditBtn">編集する</button>
    `
    );
    document.getElementById('profileEditBtn').addEventListener('click', () => this.openEditForm(company));
  },

  openEditForm(company) {
    const isEdit = !!company;
    Modal.open(
      isEdit ? '受入企業 編集' : '受入企業 新規登録',
      `
      <form id="companyForm">
        <div class="form-group"><label>企業名 *</label><input id="f_name" required value="${company ? escapeHtml(company.name) : ''}"></div>
        <div class="form-group"><label>所在地</label><input id="f_address" value="${company ? escapeHtml(company.address) : ''}"></div>
        <div class="form-row">
          <div class="form-group"><label>担当者</label><input id="f_contactPerson" value="${company ? escapeHtml(company.contactPerson) : ''}"></div>
          <div class="form-group"><label>電話番号</label><input id="f_phone" value="${company ? escapeHtml(company.phone) : ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>技能指導員</label><input id="f_skillInstructor" value="${company ? escapeHtml(company.skillInstructor) : ''}"></div>
          <div class="form-group"><label>生活指導員</label><input id="f_lifeInstructor" value="${company ? escapeHtml(company.lifeInstructor) : ''}"></div>
        </div>
        <div class="form-group"><label>宿舎情報</label><input id="f_dormitoryInfo" value="${company ? escapeHtml(company.dormitoryInfo) : ''}"></div>
        <div class="form-group"><label>備考</label><input id="f_notes" value="${company ? escapeHtml(company.notes) : ''}"></div>
        <div id="formErrors" class="alert-error" hidden></div>
        <button type="submit" class="btn btn-primary">${isEdit ? '更新する' : '登録する'}</button>
      </form>
    `
    );

    document.getElementById('companyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        name: document.getElementById('f_name').value,
        address: document.getElementById('f_address').value,
        contactPerson: document.getElementById('f_contactPerson').value,
        phone: document.getElementById('f_phone').value,
        skillInstructor: document.getElementById('f_skillInstructor').value,
        lifeInstructor: document.getElementById('f_lifeInstructor').value,
        dormitoryInfo: document.getElementById('f_dormitoryInfo').value,
        notes: document.getElementById('f_notes').value,
        status: 'active',
      };
      try {
        if (isEdit) await api.put(`/api/host-companies/${company.id}`, body);
        else await api.post('/api/host-companies', body);
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
    if (!confirm('この受入企業を削除しますか？')) return;
    await api.del(`/api/host-companies/${id}`);
    await this.load();
  },
};
