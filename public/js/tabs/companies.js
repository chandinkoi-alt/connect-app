const TabCompanies = {
  dormitoryOptions: { roomSizeOptions: [], lockOptions: [] },

  // 36協定・責任者講習・建設業許可の期限をひと目で確認できるよう、一覧の各行に
  // 短いバッジを縦に並べて表示する（未登録の企業は「未登録」表示のみ）。
  renderKeyDeadlines(keyDeadlines) {
    if (!keyDeadlines) return '－';
    const items = [
      [keyDeadlines.agreement36, '36協定'],
      [keyDeadlines.managerTraining, '講習'],
      [keyDeadlines.constructionLicense, '建設業'],
    ];
    const badgeClass = { ok: 'badge-ok', warning: 'badge-warning', expired: 'badge-expired', unknown: 'badge-unknown' };
    return `<div class="deadline-stack">${items
      .map(([d, short]) => {
        if (!d || !d.expiryDate) return `<span class="badge badge-unknown badge-tiny">${short} 未登録</span>`;
        return `<span class="badge ${badgeClass[d.level]} badge-tiny" title="${escapeHtml(d.name)}">${short} ${escapeHtml(d.expiryDate)}</span>`;
      })
      .join('')}</div>`;
  },

  async render(container) {
    container.innerHTML = `
      <section class="card">
        <div class="card-title-row">
          <h2 class="card-title">受入企業一覧</h2>
          <button class="btn btn-primary btn-small" id="addCompanyBtn">＋ 新規登録</button>
        </div>
        <div class="filter-bar">
          <input type="text" id="companySearchInput" placeholder="企業名・業種・所在地で検索" />
        </div>
        <div class="table-wrap table-wrap-freeze">
          <table>
            <thead>
              <tr><th>No.</th><th>企業名</th><th>業種</th><th>所在地</th><th>担当者</th><th>電話番号</th><th>重要期限</th><th>状態</th><th></th></tr>
            </thead>
            <tbody id="companyTableBody">${loadingRowHtml(9)}</tbody>
          </table>
        </div>
      </section>
    `;
    this.dormitoryOptions = await api.get('/api/host-companies/dormitory-options');
    document.getElementById('addCompanyBtn').addEventListener('click', () => this.openEditForm());
    document.getElementById('companySearchInput').addEventListener('input', debounce(() => this.load(), 300));
    await this.load();
  },

  async load() {
    const search = (document.getElementById('companySearchInput')?.value || '').trim().toLowerCase();
    let companies = await api.get('/api/host-companies');
    // リード（見込み客）はカンバン画面で管理するため、ここでは受入中・退会のみ表示する
    companies = companies.filter((c) => c.status === 'active' || c.status === 'withdrawn');
    if (search) {
      companies = companies.filter(
        (c) =>
          c.name.toLowerCase().includes(search) ||
          (c.industry || '').toLowerCase().includes(search) ||
          (c.address || '').toLowerCase().includes(search)
      );
    }
    // 在籍中を上、退会を下へ。それぞれの中では企業№（Excel由来の通し番号）順、無いものは末尾。
    companies.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'withdrawn' ? 1 : -1;
      const an = a.companyNo ?? Infinity;
      const bn = b.companyNo ?? Infinity;
      if (an !== bn) return an - bn;
      return a.name.localeCompare(b.name);
    });

    const tbody = document.getElementById('companyTableBody');
    if (!tbody) return;
    if (!companies.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="9">受入企業が登録されていません。</td></tr>';
      return;
    }
    tbody.innerHTML = companies
      .map(
        (c) => `
      <tr class="${c.status === 'withdrawn' ? 'row-dimmed' : ''}">
        <td>${c.companyNo ?? '－'}</td>
        <td><a href="#" class="link-view" data-id="${c.id}">${escapeHtml(c.name)}</a></td>
        <td>${escapeHtml(c.industry)}</td>
        <td class="cell-wrap">${escapeHtml(c.address)}</td>
        <td>${escapeHtml(c.contactPerson)}</td>
        <td>${escapeHtml(c.phone)}</td>
        <td>${this.renderKeyDeadlines(c.keyDeadlines)}</td>
        <td><span class="badge ${c.status === 'withdrawn' ? 'badge-muted' : 'badge-ok'}">${c.status === 'withdrawn' ? '退会' : '受入中'}</span></td>
        <td class="row-actions">
          <button class="link-btn link-edit" data-id="${c.id}" data-action="edit">編集</button>
          <button class="link-btn" data-id="${c.id}" data-action="toggle-status">${c.status === 'withdrawn' ? '受入再開' : '退会にする'}</button>
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
        else if (btn.dataset.action === 'toggle-status') this.toggleStatus(companies.find((c) => c.id === id));
        else this.remove(id);
      });
    });
  },

  async toggleStatus(company) {
    const nextStatus = company.status === 'withdrawn' ? 'active' : 'withdrawn';
    const message = nextStatus === 'withdrawn' ? `${company.name} を退会にしますか？` : `${company.name} の受入を再開しますか？`;
    const okLabel = nextStatus === 'withdrawn' ? '退会にする' : '受入再開する';
    if (!(await ConfirmDialog.show(message, { okLabel, danger: nextStatus === 'withdrawn' }))) return;
    await api.put(`/api/host-companies/${company.id}/status`, { status: nextStatus });
    await this.load();
  },

  async openProfile(company) {
    const [regs, audits, officers] = await Promise.all([
      api.get(`/api/host-companies/${company.id}/registrations`),
      api.get(`/api/visits?hostCompanyId=${company.id}&type=${encodeURIComponent('監査')}`),
      api.get(`/api/host-companies/${company.id}/officers`),
    ]);
    const completedAudits = audits.filter((a) => a.completedDate).sort((a, b) => (a.completedDate < b.completedDate ? 1 : -1));
    const lastAuditDate = completedAudits.length ? completedAudits[0].completedDate : '';

    Modal.open(
      `${company.name}（受入企業一覧）`,
      `
      <div class="profile-grid">
        <div><label>No.</label><div>${company.companyNo ?? '－'}</div></div>
        <div><label>状態</label><div><span class="badge ${company.status === 'withdrawn' ? 'badge-muted' : 'badge-ok'}">${company.status === 'withdrawn' ? '退会' : '受入中'}</span></div></div>
        <div><label>業種</label><div>${escapeHtml(company.industry) || '－'}</div></div>
        <div><label>所在地</label><div>${escapeHtml(company.address) || '－'}</div></div>
        <div><label>担当者</label><div>${escapeHtml(company.contactPerson) || '－'}</div></div>
        <div><label>電話番号</label><div>${escapeHtml(company.phone) || '－'}</div></div>
        <div><label>メール</label><div>${escapeHtml(company.email) || '－'}</div></div>
        <div><label>受入開始日</label><div>${escapeHtml(company.acceptanceStartDate) || '－'}</div></div>
        <div><label>直近監査日</label><div>${escapeHtml(lastAuditDate) || '－'}</div></div>
        <div><label>代表者</label><div>${escapeHtml(company.representativeName) || '－'}</div></div>
        <div><label>常勤職員数</label><div>${company.regularEmployeeCount ?? '－'}</div></div>
        <div><label>実習責任者</label><div>${escapeHtml(company.trainingManagerName) || '－'}</div></div>
        <div><label>技能指導員</label><div>${escapeHtml(company.skillInstructor) || '－'}</div></div>
        <div><label>生活指導員</label><div>${escapeHtml(company.lifeInstructor) || '－'}</div></div>
        <div><label>引落口座（請求書用）</label><div>${company.bankAccountLast3 ? `${escapeHtml(company.bankAccountType) || '普通'}　＊＊＊＊${escapeHtml(company.bankAccountLast3)}` : '－'}</div></div>
        <div><label>法人番号</label><div>${escapeHtml(company.corporateNumber) || '－'}</div></div>
        <div><label>業種（認定申請書用）</label><div>${escapeHtml(company.industryMajorName) || escapeHtml(company.industryMinorName) ? `${escapeHtml(company.industryMajorName)}${company.industryMajorName && company.industryMinorName ? ' / ' : ''}${escapeHtml(company.industryMinorName)}` : '－'}</div></div>
      </div>

      <h4 class="section-title">宿舎情報</h4>
      <div class="profile-grid">
        <div class="span-2"><label>宿舎住所</label><div>${escapeHtml(company.dormitoryAddress) || '－'}</div></div>
        <div><label>月額費用（本人負担）</label><div>${company.dormitoryMonthlyFee ? company.dormitoryMonthlyFee.toLocaleString('ja-JP') + ' 円' : '－'}</div></div>
        <div><label>居室面積基準</label><div>${escapeHtml(company.dormitoryRoomSizeOk) || '－'}</div></div>
        <div><label>個室の鍵</label><div>${escapeHtml(company.dormitoryHasLock) || '－'}</div></div>
        <div><label>貴重品保管設備</label><div>${escapeHtml(company.dormitoryHasValuablesStorage) || '－'}</div></div>
        <div class="span-2"><label>宿舎に関する備考</label><div>${escapeHtml(company.dormitoryInfo) || '－'}</div></div>
      </div>

      <div class="span-2"><label>備考</label><div>${escapeHtml(company.notes) || '－'}</div></div>

      <h4 class="section-title">登録・保険・許認可（${regs.length}件）</h4>
      <div id="companyRegsList">${this.renderRegistrations(regs)}</div>
      <div class="form-row" style="margin-top:10px;">
        <div class="form-group"><label>項目名</label><input id="newRegLabel" placeholder="例: 36協定, 建設業許可"></div>
        <div class="form-group"><label>登録・許可番号</label><input id="newRegNumber"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>発行日</label><input id="newRegIssueDate" type="date"></div>
        <div class="form-group"><label>有効期限</label><input id="newRegExpiryDate" type="date"></div>
      </div>
      <button class="btn btn-secondary btn-small" id="addRegBtn" style="width:auto;">追加する</button>

      <h4 class="section-title">役員一覧（認定申請書用・${officers.length}名）</h4>
      <div id="companyOfficersList">${this.renderOfficers(officers)}</div>
      <div class="form-row" style="margin-top:10px;">
        <div class="form-group"><label>氏名</label><input id="newOfficerName" placeholder="例: 山田太郎"></div>
        <div class="form-group"><label>役職名</label><input id="newOfficerTitle" placeholder="例: 代表取締役"></div>
      </div>
      <div class="form-group"><label>住所（技能実習業務に直接関与しない役員は省略可）</label><input id="newOfficerAddress" placeholder="〒999-9999 ○○..."></div>
      <button class="btn btn-secondary btn-small" id="addOfficerBtn" style="width:auto;">追加する</button>

      <div class="form-actions" style="margin-top:15px;">
        <button class="btn btn-primary" id="profileEditBtn">基本情報を編集する</button>
      </div>
    `
    );

    const modalBox = document.querySelector('.modal-box');
    if (modalBox) modalBox.style.maxWidth = '720px';

    document.getElementById('profileEditBtn').addEventListener('click', () => this.openEditForm(company));
    this.wireRegistrationHandlers(company.id);
    this.wireOfficerHandlers(company.id);
  },

  renderOfficers(officers) {
    if (!officers.length) return '<div class="empty-hint">役員が登録されていません。</div>';
    return `
      <div class="table-wrap">
        <table>
          <thead><tr><th>氏名</th><th>役職名</th><th>住所</th><th></th></tr></thead>
          <tbody>
            ${officers
              .map(
                (o) => `
              <tr data-officer-id="${o.id}">
                <td><input class="officer-name" value="${escapeHtml(o.name)}" style="min-width:100px;"></td>
                <td><input class="officer-title" value="${escapeHtml(o.title)}" style="min-width:100px;"></td>
                <td><input class="officer-address" value="${escapeHtml(o.address)}" style="min-width:200px;"></td>
                <td><button class="link-btn link-delete" data-action="delete-officer" data-id="${o.id}">削除</button></td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`;
  },

  wireOfficerHandlers(companyId) {
    document.querySelectorAll('#companyOfficersList tr[data-officer-id]').forEach((row) => {
      const officerId = row.dataset.officerId;
      const save = async () => {
        await api.put(`/api/host-companies/${companyId}/officers/${officerId}`, {
          name: row.querySelector('.officer-name').value,
          title: row.querySelector('.officer-title').value,
          address: row.querySelector('.officer-address').value,
        });
      };
      row.querySelectorAll('input').forEach((input) => input.addEventListener('change', save));
    });

    document.querySelectorAll('button[data-action="delete-officer"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await ConfirmDialog.show('この役員を削除しますか？'))) return;
        await api.del(`/api/host-companies/${companyId}/officers/${btn.dataset.id}`);
        const officers = await api.get(`/api/host-companies/${companyId}/officers`);
        document.getElementById('companyOfficersList').innerHTML = this.renderOfficers(officers);
        this.wireOfficerHandlers(companyId);
      });
    });

    document.getElementById('addOfficerBtn').addEventListener('click', async () => {
      const name = document.getElementById('newOfficerName').value;
      if (!name.trim()) return;
      await api.post(`/api/host-companies/${companyId}/officers`, {
        name,
        title: document.getElementById('newOfficerTitle').value,
        address: document.getElementById('newOfficerAddress').value,
      });
      const officers = await api.get(`/api/host-companies/${companyId}/officers`);
      document.getElementById('companyOfficersList').innerHTML = this.renderOfficers(officers);
      this.wireOfficerHandlers(companyId);
      document.getElementById('newOfficerName').value = '';
      document.getElementById('newOfficerTitle').value = '';
      document.getElementById('newOfficerAddress').value = '';
    });
  },

  renderRegistrations(regs) {
    if (!regs.length) return '<div class="empty-hint">登録項目がありません。</div>';
    const badgeClass = { ok: 'badge-ok', warning: 'badge-warning', expired: 'badge-expired', unknown: 'badge-unknown' };
    return `
      <div class="table-wrap">
        <table>
          <thead><tr><th>項目名</th><th>番号</th><th>発行日</th><th>有効期限</th><th>状態</th><th></th></tr></thead>
          <tbody>
            ${regs
              .map((r) => {
                const urgency = getExpiryUrgency(r.expiryDate);
                return `
              <tr data-reg-id="${r.id}">
                <td><input class="reg-label" value="${escapeHtml(r.label)}" style="min-width:120px;"></td>
                <td><input class="reg-number" value="${escapeHtml(r.registrationNumber)}" style="min-width:100px;"></td>
                <td><input class="reg-issue" type="date" value="${r.issueDate || ''}"></td>
                <td><input class="reg-expiry" type="date" value="${r.expiryDate || ''}"></td>
                <td><span class="badge ${badgeClass[urgency.level]}">${urgency.label}</span></td>
                <td><button class="link-btn link-delete" data-action="delete-reg" data-id="${r.id}">削除</button></td>
              </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>`;
  },

  wireRegistrationHandlers(companyId) {
    document.querySelectorAll('#companyRegsList tr[data-reg-id]').forEach((row) => {
      const regId = row.dataset.regId;
      const save = async () => {
        await api.put(`/api/host-companies/${companyId}/registrations/${regId}`, {
          label: row.querySelector('.reg-label').value,
          registrationNumber: row.querySelector('.reg-number').value,
          issueDate: row.querySelector('.reg-issue').value,
          expiryDate: row.querySelector('.reg-expiry').value,
        });
      };
      row.querySelectorAll('input').forEach((input) => input.addEventListener('change', save));
    });

    document.querySelectorAll('button[data-action="delete-reg"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await ConfirmDialog.show('この登録項目を削除しますか？'))) return;
        await api.del(`/api/host-companies/${companyId}/registrations/${btn.dataset.id}`);
        const regs = await api.get(`/api/host-companies/${companyId}/registrations`);
        document.getElementById('companyRegsList').innerHTML = this.renderRegistrations(regs);
        this.wireRegistrationHandlers(companyId);
      });
    });

    document.getElementById('addRegBtn').addEventListener('click', async () => {
      const label = document.getElementById('newRegLabel').value;
      if (!label.trim()) return;
      await api.post(`/api/host-companies/${companyId}/registrations`, {
        label,
        registrationNumber: document.getElementById('newRegNumber').value,
        issueDate: document.getElementById('newRegIssueDate').value,
        expiryDate: document.getElementById('newRegExpiryDate').value,
      });
      const regs = await api.get(`/api/host-companies/${companyId}/registrations`);
      document.getElementById('companyRegsList').innerHTML = this.renderRegistrations(regs);
      this.wireRegistrationHandlers(companyId);
      document.getElementById('newRegLabel').value = '';
      document.getElementById('newRegNumber').value = '';
      document.getElementById('newRegIssueDate').value = '';
      document.getElementById('newRegExpiryDate').value = '';
    });
  },

  openEditForm(company) {
    const isEdit = !!company;
    const roomSizeOpts = this.dormitoryOptions.roomSizeOptions || [];
    const lockOpts = this.dormitoryOptions.lockOptions || [];
    const selectHtml = (id, options, current) =>
      `<select id="${id}"><option value="">選択</option>${options.map((o) => `<option value="${o}" ${current === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;

    Modal.open(
      isEdit ? '受入企業 編集' : '受入企業 新規登録',
      `
      <form id="companyForm">
        <div class="form-row">
          <div class="form-group">
            <label>企業名 *</label>
            <input id="f_name" required placeholder="株式会社〇〇建設" value="${company ? escapeHtml(company.name) : ''}">
            <small class="field-hint">認定申請書等の公的書類に使うため、「株式会社」「有限会社」等を省略せず正式名称で入力してください。</small>
          </div>
          <div class="form-group"><label>企業名フリガナ</label><input id="f_nameKana" placeholder="カブシキガイシャ〇〇ケンセツ" value="${company ? escapeHtml(company.nameKana) : ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>業種</label><input id="f_industry" value="${company ? escapeHtml(company.industry) : ''}"></div>
        </div>
        <div class="form-group"><label>所在地</label><textarea id="f_address" rows="2" placeholder="本社と送付先など2件ある場合は改行で分けて入力できます">${company ? escapeHtml(company.address) : ''}</textarea></div>
        <div class="form-row">
          <div class="form-group"><label>担当者</label><input id="f_contactPerson" value="${company ? escapeHtml(company.contactPerson) : ''}"></div>
          <div class="form-group"><label>電話番号</label><input id="f_phone" value="${company ? escapeHtml(company.phone) : ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>メール</label><input id="f_email" value="${company ? escapeHtml(company.email) : ''}"></div>
          <div class="form-group"><label>受入開始日</label><input id="f_acceptanceStartDate" type="date" value="${company ? company.acceptanceStartDate || '' : ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>代表者</label><input id="f_representativeName" value="${company ? escapeHtml(company.representativeName) : ''}"></div>
          <div class="form-group"><label>常勤職員数</label><input id="f_regularEmployeeCount" type="number" value="${company && company.regularEmployeeCount ? company.regularEmployeeCount : ''}"></div>
        </div>
        <div class="form-group"><label>技能実習・育成就労責任者</label><input id="f_trainingManagerName" value="${company ? escapeHtml(company.trainingManagerName) : ''}"></div>
        <div class="form-row">
          <div class="form-group"><label>技能指導員</label><input id="f_skillInstructor" value="${company ? escapeHtml(company.skillInstructor) : ''}"></div>
          <div class="form-group"><label>生活指導員</label><input id="f_lifeInstructor" value="${company ? escapeHtml(company.lifeInstructor) : ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>引落口座の種類（請求書用）</label><input id="f_bankAccountType" placeholder="普通" value="${company ? escapeHtml(company.bankAccountType) : ''}"></div>
          <div class="form-group"><label>引落口座 下3〜4ケタ（請求書用）</label><input id="f_bankAccountLast3" maxlength="4" placeholder="例: 637" value="${company ? escapeHtml(company.bankAccountLast3) : ''}"></div>
        </div>

        <h4 class="section-title">認定申請書用の項目</h4>
        <div class="form-group"><label>法人番号</label><input id="f_corporateNumber" maxlength="13" placeholder="13桁の数字" value="${company ? escapeHtml(company.corporateNumber) : ''}"></div>
        <div class="form-row">
          <div class="form-group"><label>業種（大分類）</label><input id="f_industryMajorName" placeholder="例: 建設業" value="${company ? escapeHtml(company.industryMajorName) : ''}"></div>
          <div class="form-group"><label>業種コード（大分類）</label><input id="f_industryMajorCode" placeholder="例: D" value="${company ? escapeHtml(company.industryMajorCode) : ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>業種（小分類）</label><input id="f_industryMinorName" placeholder="例: とび・土工・コンクリート工事業" value="${company ? escapeHtml(company.industryMinorName) : ''}"></div>
          <div class="form-group"><label>業種コード（小分類）</label><input id="f_industryMinorCode" placeholder="例: 0611" value="${company ? escapeHtml(company.industryMinorCode) : ''}"></div>
        </div>

        <h4 class="section-title">宿舎情報</h4>
        <div class="form-group"><label>宿舎住所</label><input id="f_dormitoryAddress" value="${company ? escapeHtml(company.dormitoryAddress) : ''}"></div>
        <div class="form-row">
          <div class="form-group"><label>月額費用（本人負担・円）</label><input id="f_dormitoryMonthlyFee" type="number" value="${company && company.dormitoryMonthlyFee ? company.dormitoryMonthlyFee : ''}"></div>
          <div class="form-group"><label>居室面積基準</label>${selectHtml('f_dormitoryRoomSizeOk', roomSizeOpts, company ? company.dormitoryRoomSizeOk : '')}</div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>個室の鍵</label>${selectHtml('f_dormitoryHasLock', lockOpts, company ? company.dormitoryHasLock : '')}</div>
          <div class="form-group"><label>貴重品保管設備</label>${selectHtml('f_dormitoryHasValuablesStorage', lockOpts, company ? company.dormitoryHasValuablesStorage : '')}</div>
        </div>
        <div class="form-group"><label>宿舎に関する備考</label><input id="f_dormitoryInfo" value="${company ? escapeHtml(company.dormitoryInfo) : ''}"></div>

        <div class="form-group"><label>備考</label><input id="f_notes" value="${company ? escapeHtml(company.notes) : ''}"></div>
        <div id="formErrors" class="alert-error" hidden></div>
        <button type="submit" class="btn btn-primary">${isEdit ? '更新する' : '登録する'}</button>
      </form>
    `
    );

    const modalBox = document.querySelector('.modal-box');
    if (modalBox) modalBox.style.maxWidth = '640px';

    document.getElementById('companyForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = (id) => document.getElementById(id).value;
      const body = {
        name: val('f_name'),
        nameKana: val('f_nameKana'),
        industry: val('f_industry'),
        address: val('f_address'),
        contactPerson: val('f_contactPerson'),
        phone: val('f_phone'),
        email: val('f_email'),
        acceptanceStartDate: val('f_acceptanceStartDate'),
        representativeName: val('f_representativeName'),
        regularEmployeeCount: val('f_regularEmployeeCount'),
        trainingManagerName: val('f_trainingManagerName'),
        skillInstructor: val('f_skillInstructor'),
        lifeInstructor: val('f_lifeInstructor'),
        dormitoryAddress: val('f_dormitoryAddress'),
        dormitoryMonthlyFee: val('f_dormitoryMonthlyFee'),
        dormitoryRoomSizeOk: val('f_dormitoryRoomSizeOk'),
        dormitoryHasLock: val('f_dormitoryHasLock'),
        dormitoryHasValuablesStorage: val('f_dormitoryHasValuablesStorage'),
        dormitoryInfo: val('f_dormitoryInfo'),
        bankAccountType: val('f_bankAccountType'),
        bankAccountLast3: val('f_bankAccountLast3'),
        corporateNumber: val('f_corporateNumber'),
        industryMajorCode: val('f_industryMajorCode'),
        industryMajorName: val('f_industryMajorName'),
        industryMinorCode: val('f_industryMinorCode'),
        industryMinorName: val('f_industryMinorName'),
        notes: val('f_notes'),
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
    if (!(await ConfirmDialog.show('この受入企業を削除しますか？\nこの操作は取り消せません。'))) return;
    await api.del(`/api/host-companies/${id}`);
    await this.load();
  },
};
