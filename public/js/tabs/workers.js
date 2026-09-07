const TabWorkers = {
  visaTypes: [],
  statusTypes: [],
  companies: [],
  sendingOrgs: [],

  async render(container) {
    container.innerHTML = `
      <section class="stats-bar" id="statsBar"></section>
      <section class="card">
        <div class="card-title-row">
          <h2 class="card-title">人材360（実習生・育成就労・特定技能 対象者）</h2>
          <div class="row-actions">
            <button class="btn btn-success btn-small" id="exportRosterBtn">📥 名簿をExcel出力</button>
            <button class="btn btn-primary btn-small" id="addWorkerBtn">＋ 新規登録</button>
          </div>
        </div>
        <div class="filter-bar">
          <input type="text" id="searchInput" placeholder="氏名・企業・国籍で検索" />
          <select id="filterStatusType"><option value="">すべての制度区分</option></select>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>氏名</th><th>制度区分</th><th>在留資格</th><th>受入企業</th><th>在留期限</th><th>状態</th><th></th></tr>
            </thead>
            <tbody id="workerTableBody"><tr><td colspan="7">読み込み中...</td></tr></tbody>
          </table>
        </div>
      </section>
    `;

    [this.visaTypes, this.statusTypes, this.companies, this.sendingOrgs] = await Promise.all([
      api.get('/api/workers/visa-types'),
      api.get('/api/workers/status-types'),
      api.get('/api/host-companies?status=active'),
      api.get('/api/sending-orgs'),
    ]);

    const filterSelect = document.getElementById('filterStatusType');
    filterSelect.innerHTML += this.statusTypes.map((s) => `<option value="${s}">${s}</option>`).join('');

    document.getElementById('addWorkerBtn').addEventListener('click', () => this.openEditForm());
    document.getElementById('exportRosterBtn').addEventListener('click', () => {
      window.location.href = '/api/workers/export/roster';
    });
    document.getElementById('searchInput').addEventListener('input', debounce(() => this.load(), 300));
    filterSelect.addEventListener('change', () => this.load());

    await this.loadStats();
    await this.load();
  },

  async loadStats() {
    const stats = await api.get('/api/dashboard/stats');
    document.getElementById('statsBar').innerHTML = `
      <div class="stat-card"><div class="stat-value">${stats.activeWorkers}</div><div class="stat-label">総対象者数</div></div>
      <div class="stat-card"><div class="stat-value">${stats.hostCompanies}</div><div class="stat-label">受入企業数</div></div>
      <div class="stat-card"><div class="stat-value">${stats.processingCases}</div><div class="stat-label">処理中の申請</div></div>
      <div class="stat-card warning"><div class="stat-value">${stats.warningCount}</div><div class="stat-label">期限間近</div></div>
      <div class="stat-card expired"><div class="stat-value">${stats.urgentCount}</div><div class="stat-label">期限切れ</div></div>
    `;
  },

  async load() {
    const params = new URLSearchParams();
    const search = document.getElementById('searchInput').value.trim();
    const statusType = document.getElementById('filterStatusType').value;
    if (search) params.set('search', search);
    if (statusType) params.set('statusType', statusType);

    const workers = await api.get(`/api/workers?${params.toString()}`);
    const tbody = document.getElementById('workerTableBody');
    if (!workers.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">対象者が登録されていません。</td></tr>';
      return;
    }
    const badgeClass = { ok: 'badge-ok', warning: 'badge-warning', expired: 'badge-expired', unknown: 'badge-unknown' };
    tbody.innerHTML = workers
      .map((w) => {
        const s = w.visaStatus;
        const daysLabel = s.days === null ? '' : s.days < 0 ? `（${Math.abs(s.days)}日超過）` : `（残り${s.days}日）`;
        return `
        <tr>
          <td><a href="#" class="link-view" data-id="${w.id}">${escapeHtml(w.name)}</a></td>
          <td>${escapeHtml(w.statusType)}</td>
          <td>${escapeHtml(w.visaType)}</td>
          <td>${escapeHtml(w.companyName)}</td>
          <td>${escapeHtml(w.visaExpiryDate)}</td>
          <td><span class="badge ${badgeClass[s.level]}">${s.label}${daysLabel}</span></td>
          <td class="row-actions">
            <button class="link-btn link-edit" data-id="${w.id}" data-action="edit">編集</button>
            <button class="link-btn link-doc" data-id="${w.id}" data-action="doc">書類</button>
            <button class="link-btn link-delete" data-id="${w.id}" data-action="delete">削除</button>
          </td>
        </tr>`;
      })
      .join('');

    tbody.querySelectorAll('a.link-view').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this.openProfile(Number(a.dataset.id));
      });
    });
    tbody.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        if (btn.dataset.action === 'edit') this.openEditForm(workers.find((w) => w.id === id));
        else if (btn.dataset.action === 'doc') window.location.href = `/api/workers/${id}/document`;
        else this.remove(id);
      });
    });
  },

  async openProfile(id) {
    const data = await api.get(`/api/workers/${id}/profile360`);
    const w = data.worker;
    const doneCount = (c) => c.checklist.filter((i) => i.done).length;

    Modal.open(
      `${w.name}（人材360）`,
      `
      <div class="profile-grid">
        <div><label>フリガナ</label><div>${escapeHtml(w.nameKana) || '－'}</div></div>
        <div><label>国籍</label><div>${escapeHtml(w.nationality) || '－'}</div></div>
        <div><label>性別</label><div>${escapeHtml(w.gender) || '－'}</div></div>
        <div><label>生年月日</label><div>${escapeHtml(w.dob) || '－'}</div></div>
        <div><label>旅券番号</label><div>${escapeHtml(w.passportNumber) || '－'}</div></div>
        <div><label>在留カード番号</label><div>${escapeHtml(w.residenceCardNumber) || '－'}</div></div>
        <div><label>制度区分</label><div>${escapeHtml(w.statusType)}</div></div>
        <div><label>在留資格</label><div>${escapeHtml(w.visaType)}</div></div>
        <div><label>在留期限</label><div>${escapeHtml(w.visaExpiryDate)}（${w.visaStatus.label}）</div></div>
        <div><label>受入企業</label><div>${escapeHtml(w.companyName) || '－'}</div></div>
        <div><label>送出機関</label><div>${escapeHtml(w.sendingOrgName) || '－'}</div></div>
        <div><label>職種・作業</label><div>${escapeHtml(w.jobCategory) || '－'}</div></div>
      </div>

      <h4 class="section-title">労働条件</h4>
      <div class="profile-grid">
        <div><label>基本賃金</label><div>${w.baseSalary ? w.baseSalary.toLocaleString('ja-JP') + ' 円' : '－'}</div></div>
        <div><label>労働時間</label><div>${escapeHtml(w.workingHours) || '－'}</div></div>
        <div><label>割増賃金率</label><div>${escapeHtml(w.overtimeRate) || '－'}</div></div>
        <div><label>手当</label><div>${escapeHtml(w.allowances) || '－'}</div></div>
        <div><label>控除</label><div>${escapeHtml(w.deductions) || '－'}</div></div>
        <div><label>健康診断日</label><div>${escapeHtml(w.healthCheckDate) || '－'}</div></div>
        <div><label>相談窓口</label><div>${escapeHtml(w.consultationContact) || '－'}</div></div>
        <div><label>保険加入状況</label><div>${escapeHtml(w.insuranceStatus) || '－'}</div></div>
        <div class="span-2"><label>宿舎情報</label><div>${escapeHtml(w.dormitoryInfo) || '－'}</div></div>
      </div>

      <h4 class="section-title">認定申請（${data.applicationCases.length}件）</h4>
      ${
        data.applicationCases.length
          ? `<ul class="mini-list">${data.applicationCases
              .map((c) => `<li>${escapeHtml(c.stage) || c.statusType} — ${escapeHtml(c.status)}（書類 ${doneCount(c)}/${c.checklist.length}）</li>`)
              .join('')}</ul>`
          : '<div class="empty-hint">なし</div>'
      }

      <h4 class="section-title">面談・監査 記録（${data.visits.length}件）</h4>
      ${
        data.visits.length
          ? `<ul class="mini-list">${data.visits
              .map((v) => `<li>${escapeHtml(v.type)} — ${escapeHtml(v.scheduledDate)}${v.completedDate ? '（実施済み）' : ''}</li>`)
              .join('')}</ul>`
          : '<div class="empty-hint">なし</div>'
      }

      <div class="form-actions" style="margin-top:15px;">
        <button class="btn btn-primary" id="profileEditBtn">編集する</button>
        <button class="btn btn-success" id="profileDocBtn">📥 個人票をExcel出力</button>
      </div>
    `
    );
    document.getElementById('profileEditBtn').addEventListener('click', () => this.openEditForm(w));
    document.getElementById('profileDocBtn').addEventListener('click', () => {
      window.location.href = `/api/workers/${id}/document`;
    });
  },

  openEditForm(worker) {
    const isEdit = !!worker;
    const companyOptions = this.companies
      .map((c) => `<option value="${c.id}" ${worker && worker.hostCompanyId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
      .join('');
    const orgOptions = this.sendingOrgs
      .map((o) => `<option value="${o.id}" ${worker && worker.sendingOrgId === o.id ? 'selected' : ''}>${escapeHtml(o.name)}</option>`)
      .join('');
    const visaOptions = this.visaTypes
      .map((v) => `<option value="${v}" ${worker && worker.visaType === v ? 'selected' : ''}>${v}</option>`)
      .join('');
    const statusOptions = this.statusTypes
      .map((s) => `<option value="${s}" ${worker && worker.statusType === s ? 'selected' : ''}>${s}</option>`)
      .join('');

    Modal.open(
      isEdit ? '対象者 編集' : '対象者 新規登録',
      `
      <form id="workerForm">
        <div class="form-row">
          <div class="form-group"><label>氏名（ローマ字）*</label><input id="f_name" required value="${worker ? escapeHtml(worker.name) : ''}"></div>
          <div class="form-group"><label>フリガナ</label><input id="f_nameKana" value="${worker ? escapeHtml(worker.nameKana) : ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>国籍</label><input id="f_nationality" value="${worker ? escapeHtml(worker.nationality) : ''}"></div>
          <div class="form-group"><label>性別</label>
            <select id="f_gender"><option value="">選択</option><option value="男" ${worker && worker.gender === '男' ? 'selected' : ''}>男</option><option value="女" ${worker && worker.gender === '女' ? 'selected' : ''}>女</option></select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>生年月日</label><input id="f_dob" type="date" value="${worker ? worker.dob || '' : ''}"></div>
          <div class="form-group"><label>旅券番号</label><input id="f_passportNumber" value="${worker ? escapeHtml(worker.passportNumber) : ''}"></div>
        </div>
        <div class="form-group"><label>在留カード番号</label><input id="f_residenceCardNumber" value="${worker ? escapeHtml(worker.residenceCardNumber) : ''}"></div>
        <div class="form-row">
          <div class="form-group"><label>制度区分 *</label><select id="f_statusType" required><option value="">選択</option>${statusOptions}</select></div>
          <div class="form-group"><label>在留資格 *</label><select id="f_visaType" required><option value="">選択</option>${visaOptions}</select></div>
        </div>
        <div class="form-group"><label>在留期限 *</label><input id="f_visaExpiryDate" type="date" required value="${worker ? worker.visaExpiryDate || '' : ''}"></div>
        <div class="form-group"><label>入国日</label><input id="f_entryDate" type="date" value="${worker ? worker.entryDate || '' : ''}"></div>
        <div class="form-row">
          <div class="form-group"><label>受入企業</label><select id="f_hostCompanyId"><option value="">選択</option>${companyOptions}</select></div>
          <div class="form-group"><label>送出機関</label><select id="f_sendingOrgId"><option value="">選択</option>${orgOptions}</select></div>
        </div>
        <div class="form-group"><label>職種・作業</label><input id="f_jobCategory" value="${worker ? escapeHtml(worker.jobCategory) : ''}"></div>
        <div class="form-row">
          <div class="form-group"><label>雇用契約開始日</label><input id="f_contractStartDate" type="date" value="${worker ? worker.contractStartDate || '' : ''}"></div>
          <div class="form-group"><label>雇用契約終了日</label><input id="f_contractEndDate" type="date" value="${worker ? worker.contractEndDate || '' : ''}"></div>
        </div>
        <div class="form-group"><label>現在の段階</label><input id="f_currentStage" placeholder="入国前・実習中・帰国準備中 等" value="${worker ? escapeHtml(worker.currentStage) : ''}"></div>

        <h4 class="section-title">労働条件</h4>
        <div class="form-row">
          <div class="form-group"><label>基本賃金（円）</label><input id="f_baseSalary" type="number" value="${worker && worker.baseSalary ? worker.baseSalary : ''}"></div>
          <div class="form-group"><label>労働時間</label><input id="f_workingHours" placeholder="8:00-17:00" value="${worker ? escapeHtml(worker.workingHours) : ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>割増賃金率</label><input id="f_overtimeRate" placeholder="25%" value="${worker ? escapeHtml(worker.overtimeRate) : ''}"></div>
          <div class="form-group"><label>手当</label><input id="f_allowances" value="${worker ? escapeHtml(worker.allowances) : ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>控除</label><input id="f_deductions" value="${worker ? escapeHtml(worker.deductions) : ''}"></div>
          <div class="form-group"><label>健康診断日</label><input id="f_healthCheckDate" type="date" value="${worker ? worker.healthCheckDate || '' : ''}"></div>
        </div>
        <div class="form-group"><label>相談窓口</label><input id="f_consultationContact" value="${worker ? escapeHtml(worker.consultationContact) : ''}"></div>
        <div class="form-group"><label>保険加入状況</label><input id="f_insuranceStatus" value="${worker ? escapeHtml(worker.insuranceStatus) : ''}"></div>
        <div class="form-group"><label>宿舎情報</label><input id="f_dormitoryInfo" value="${worker ? escapeHtml(worker.dormitoryInfo) : ''}"></div>
        <div class="form-group"><label>電話番号</label><input id="f_phone" value="${worker ? escapeHtml(worker.phone) : ''}"></div>
        <div class="form-group"><label>備考</label><input id="f_notes" value="${worker ? escapeHtml(worker.notes) : ''}"></div>

        <div id="formErrors" class="alert-error" hidden></div>
        <button type="submit" class="btn btn-primary">${isEdit ? '更新する' : '登録する'}</button>
      </form>
    `
    );

    document.getElementById('workerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = (id) => document.getElementById(id).value;
      const body = {
        name: val('f_name'), nameKana: val('f_nameKana'), nationality: val('f_nationality'),
        gender: val('f_gender'), dob: val('f_dob'), passportNumber: val('f_passportNumber'),
        residenceCardNumber: val('f_residenceCardNumber'), statusType: val('f_statusType'),
        visaType: val('f_visaType'), visaExpiryDate: val('f_visaExpiryDate'), entryDate: val('f_entryDate'),
        hostCompanyId: val('f_hostCompanyId') || null, sendingOrgId: val('f_sendingOrgId') || null,
        jobCategory: val('f_jobCategory'), contractStartDate: val('f_contractStartDate'),
        contractEndDate: val('f_contractEndDate'), currentStage: val('f_currentStage'),
        baseSalary: val('f_baseSalary') || null, workingHours: val('f_workingHours'),
        overtimeRate: val('f_overtimeRate'), allowances: val('f_allowances'), deductions: val('f_deductions'),
        healthCheckDate: val('f_healthCheckDate'), consultationContact: val('f_consultationContact'),
        insuranceStatus: val('f_insuranceStatus'), dormitoryInfo: val('f_dormitoryInfo'),
        phone: val('f_phone'), notes: val('f_notes'),
      };
      try {
        if (isEdit) await api.put(`/api/workers/${worker.id}`, body);
        else await api.post('/api/workers', body);
        Modal.close();
        await this.loadStats();
        await this.load();
      } catch (err) {
        const el = document.getElementById('formErrors');
        el.textContent = formatErrors(err);
        el.hidden = false;
      }
    });
  },

  async remove(id) {
    if (!confirm('この対象者を削除しますか？')) return;
    await api.del(`/api/workers/${id}`);
    await this.loadStats();
    await this.load();
  },
};
