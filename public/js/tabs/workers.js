const TabWorkers = {
  visaTypes: [],
  statusTypes: [],
  stageOptions: [],
  tokuteiStatuses: [],
  specialHealthCheckTypes: [],
  companies: [],
  sendingOrgs: [],

  async render(container) {
    container.innerHTML = `
      <section class="stats-bar" id="statsBar"></section>
      <section class="card">
        <div class="card-title-row">
          <h2 class="card-title">人材一覧（実習生・育成就労・特定技能 対象者）</h2>
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
              <tr><th>No.</th><th>氏名</th><th>制度区分</th><th>在留資格</th><th>受入企業</th><th>在留期限</th><th>ステータス</th><th>状態</th><th></th></tr>
            </thead>
            <tbody id="workerTableBody"><tr><td colspan="9">読み込み中...</td></tr></tbody>
          </table>
        </div>
      </section>
    `;

    [this.visaTypes, this.statusTypes, this.stageOptions, this.tokuteiStatuses, this.specialHealthCheckTypes, this.companies, this.sendingOrgs] = await Promise.all([
      api.get('/api/workers/visa-types'),
      api.get('/api/workers/status-types'),
      api.get('/api/workers/stage-options'),
      api.get('/api/workers/tokutei-training-statuses'),
      api.get('/api/workers/special-health-check-types'),
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

    let workers = await api.get(`/api/workers?${params.toString()}`);
    const tbody = document.getElementById('workerTableBody');
    if (!workers.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="9">対象者が登録されていません。</td></tr>';
      return;
    }
    // 帰国済み・失踪は一覧の下部にまとめる（それぞれのグループ内では在留期限の緊急度順を維持）。
    const INACTIVE_STAGES = ['帰国済み', '失踪'];
    workers = [...workers].sort((a, b) => {
      const aInactive = INACTIVE_STAGES.includes(a.currentStage);
      const bInactive = INACTIVE_STAGES.includes(b.currentStage);
      return aInactive === bInactive ? 0 : aInactive ? 1 : -1;
    });

    const badgeClass = { ok: 'badge-ok', warning: 'badge-warning', expired: 'badge-expired', unknown: 'badge-unknown' };
    tbody.innerHTML = workers
      .map((w) => {
        const s = w.visaStatus;
        const daysLabel = s.days === null ? '' : s.days < 0 ? `（${Math.abs(s.days)}日超過）` : `（残り${s.days}日）`;
        const isInactive = INACTIVE_STAGES.includes(w.currentStage);
        const stageBadgeClass = w.currentStage === '失踪' ? 'badge-expired' : isInactive ? 'badge-muted' : 'badge-ok';
        return `
        <tr class="${isInactive ? 'row-dimmed' : ''}">
          <td>${w.personalNo ?? '－'}</td>
          <td><a href="#" class="link-view" data-id="${w.id}">${escapeHtml(w.name)}</a></td>
          <td>${escapeHtml(w.statusType)}</td>
          <td>${escapeHtml(w.visaType)}</td>
          <td>${escapeHtml(w.companyName)}</td>
          <td>${escapeHtml(w.visaExpiryDate)}</td>
          <td><span class="badge ${stageBadgeClass}">${escapeHtml(w.currentStage) || '－'}</span></td>
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
      `${w.name}（人材一覧）`,
      `
      <div class="profile-grid">
        <div><label>No.</label><div>${w.personalNo ?? '－'}</div></div>
        <div><label>フリガナ</label><div>${escapeHtml(w.nameKana) || '－'}</div></div>
        <div><label>国籍</label><div>${escapeHtml(w.nationality) || '－'}</div></div>
        <div><label>性別</label><div>${escapeHtml(w.gender) || '－'}</div></div>
        <div><label>生年月日</label><div>${escapeHtml(w.dob) || '－'}</div></div>
        <div><label>旅券番号</label><div>${escapeHtml(w.passportNumber) || '－'}</div></div>
        <div><label>旅券有効期限</label><div>${escapeHtml(w.passportExpiryDate) || '－'}</div></div>
        <div><label>在留カード番号</label><div>${escapeHtml(w.residenceCardNumber) || '－'}</div></div>
        <div><label>制度区分</label><div>${escapeHtml(w.statusType)}</div></div>
        <div><label>在留資格</label><div>${escapeHtml(w.visaType)}</div></div>
        <div><label>在留期限</label><div>${escapeHtml(w.visaExpiryDate)}（${w.visaStatus.label}）</div></div>
        <div><label>受入企業</label><div>${escapeHtml(w.companyName) || '－'}</div></div>
        <div><label>送出機関</label><div>${escapeHtml(w.sendingOrgName) || '－'}</div></div>
        <div><label>職種・作業</label><div>${escapeHtml(w.jobCategory) || '－'}</div></div>
        <div><label>入国日</label><div>${escapeHtml(w.entryDate) || '－'}</div></div>
        <div><label>実習・就労開始日</label><div>${escapeHtml(w.trainingStartDate) || '－'}</div></div>
        <div><label>ステータス</label><div>${escapeHtml(w.currentStage) || '－'}</div></div>
        <div class="span-2"><label>本国住所</label><div>${escapeHtml(w.homeCountryAddress) || '－'}</div></div>
        <div class="span-2"><label>学歴・職歴</label><div>${escapeHtml(w.educationWorkHistory) || '－'}</div></div>
      </div>

      ${
        w.statusType === '特定技能'
          ? `
      <h4 class="section-title">特定技能：法定講習</h4>
      <div class="profile-grid">
        <div><label>受講状況</label><div>${escapeHtml(w.tokuteiTrainingStatus) || '－'}</div></div>
        <div><label>受講・修了日</label><div>${escapeHtml(w.tokuteiTrainingDate) || '－'}</div></div>
      </div>`
          : ''
      }

      <h4 class="section-title">労働条件</h4>
      <div class="profile-grid">
        <div><label>基本賃金</label><div>${w.baseSalary ? w.baseSalary.toLocaleString('ja-JP') + ' 円' : '－'}</div></div>
        <div><label>給料支払日</label><div>${escapeHtml(w.payDate) || '－'}</div></div>
        <div><label>始業時刻</label><div>${escapeHtml(w.workStartTime) || '－'}</div></div>
        <div><label>終業時刻</label><div>${escapeHtml(w.workEndTime) || '－'}</div></div>
        <div><label>休日</label><div>${escapeHtml(w.holidays) || '－'}</div></div>
        <div><label>割増賃金率</label><div>${escapeHtml(w.overtimeRate) || '－'}</div></div>
        <div><label>手当</label><div>${escapeHtml(w.allowances) || '－'}</div></div>
        <div><label>控除</label><div>${escapeHtml(w.deductions) || '－'}</div></div>
        <div><label>相談窓口</label><div>${escapeHtml(w.consultationContact) || '－'}</div></div>
        <div><label>保険加入状況</label><div>${escapeHtml(w.insuranceStatus) || '－'}</div></div>
        <div class="span-2"><label>宿舎情報</label><div>${escapeHtml(w.dormitoryInfo) || '－'}</div></div>
      </div>

      <h4 class="section-title">健康診断</h4>
      <div class="profile-grid">
        <div><label>一般健康診断 最終受診日</label><div>${escapeHtml(w.healthCheckDate) || '－'}</div></div>
      </div>
      <ul class="mini-list">
        ${w.specialHealthChecks
          .map((h) => `<li>${h.applicable ? '☑' : '☐'} ${escapeHtml(h.label)}${h.applicable && h.lastExamDate ? `（最終受診: ${escapeHtml(h.lastExamDate)}）` : ''}</li>`)
          .join('')}
      </ul>

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

      <h4 class="section-title">登録・保険（${data.registrations.length}件）</h4>
      <div id="workerRegsList">${this.renderRegistrations(data.registrations)}</div>
      <div class="form-row" style="margin-top:10px;">
        <div class="form-group"><label>項目名</label><input id="newRegLabel" placeholder="例: 技能実習生総合保険, 健康保険"></div>
        <div class="form-group"><label>番号</label><input id="newRegNumber"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>発行日</label><input id="newRegIssueDate" type="date"></div>
        <div class="form-group"><label>有効期限</label><input id="newRegExpiryDate" type="date"></div>
      </div>
      <button class="btn btn-secondary btn-small" id="addRegBtn" style="width:auto;">追加する</button>

      <div class="form-actions" style="margin-top:15px;">
        <button class="btn btn-primary" id="profileEditBtn">編集する</button>
        <button class="btn btn-success" id="profileDocBtn">📥 個人票をExcel出力</button>
      </div>
    `
    );

    const modalBox = document.querySelector('.modal-box');
    if (modalBox) modalBox.style.maxWidth = '760px';

    document.getElementById('profileEditBtn').addEventListener('click', () => this.openEditForm(w));
    document.getElementById('profileDocBtn').addEventListener('click', () => {
      window.location.href = `/api/workers/${id}/document`;
    });
    this.wireRegistrationHandlers(id);
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

  wireRegistrationHandlers(workerId) {
    document.querySelectorAll('#workerRegsList tr[data-reg-id]').forEach((row) => {
      const regId = row.dataset.regId;
      const save = async () => {
        await api.put(`/api/workers/${workerId}/registrations/${regId}`, {
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
        await api.del(`/api/workers/${workerId}/registrations/${btn.dataset.id}`);
        const regs = await api.get(`/api/workers/${workerId}/registrations`);
        document.getElementById('workerRegsList').innerHTML = this.renderRegistrations(regs);
        this.wireRegistrationHandlers(workerId);
      });
    });

    document.getElementById('addRegBtn').addEventListener('click', async () => {
      const label = document.getElementById('newRegLabel').value;
      if (!label.trim()) return;
      await api.post(`/api/workers/${workerId}/registrations`, {
        label,
        registrationNumber: document.getElementById('newRegNumber').value,
        issueDate: document.getElementById('newRegIssueDate').value,
        expiryDate: document.getElementById('newRegExpiryDate').value,
      });
      const regs = await api.get(`/api/workers/${workerId}/registrations`);
      document.getElementById('workerRegsList').innerHTML = this.renderRegistrations(regs);
      this.wireRegistrationHandlers(workerId);
      document.getElementById('newRegLabel').value = '';
      document.getElementById('newRegNumber').value = '';
      document.getElementById('newRegIssueDate').value = '';
      document.getElementById('newRegExpiryDate').value = '';
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
    const tokuteiOptions = this.tokuteiStatuses
      .map((s) => `<option value="${s}" ${worker && worker.tokuteiTrainingStatus === s ? 'selected' : ''}>${s}</option>`)
      .join('');
    const specialHealthChecks =
      worker && worker.specialHealthChecks && worker.specialHealthChecks.length
        ? worker.specialHealthChecks
        : null;

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
          <div class="form-group"><label>本国住所</label><input id="f_homeCountryAddress" value="${worker ? escapeHtml(worker.homeCountryAddress) : ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>旅券番号</label><input id="f_passportNumber" value="${worker ? escapeHtml(worker.passportNumber) : ''}"></div>
          <div class="form-group"><label>旅券有効期限</label><input id="f_passportExpiryDate" type="date" value="${worker ? worker.passportExpiryDate || '' : ''}"></div>
        </div>
        <div class="form-group"><label>在留カード番号</label><input id="f_residenceCardNumber" value="${worker ? escapeHtml(worker.residenceCardNumber) : ''}"></div>
        <div class="form-row">
          <div class="form-group"><label>制度区分 *</label><select id="f_statusType" required><option value="">選択</option>${statusOptions}</select></div>
          <div class="form-group"><label>在留資格 *</label><select id="f_visaType" required><option value="">選択</option>${visaOptions}</select></div>
        </div>
        <div class="form-group"><label>在留期限 *</label><input id="f_visaExpiryDate" type="date" required value="${worker ? worker.visaExpiryDate || '' : ''}"></div>
        <div class="form-row">
          <div class="form-group"><label>入国日</label><input id="f_entryDate" type="date" value="${worker ? worker.entryDate || '' : ''}"></div>
          <div class="form-group"><label>実習・就労開始日</label><input id="f_trainingStartDate" type="date" value="${worker ? worker.trainingStartDate || '' : ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>受入企業</label><select id="f_hostCompanyId"><option value="">選択</option>${companyOptions}</select></div>
          <div class="form-group"><label>送出機関</label><select id="f_sendingOrgId"><option value="">選択</option>${orgOptions}</select></div>
        </div>
        <div class="form-group"><label>職種・作業</label><input id="f_jobCategory" value="${worker ? escapeHtml(worker.jobCategory) : ''}"></div>
        <div class="form-row">
          <div class="form-group"><label>雇用契約開始日</label><input id="f_contractStartDate" type="date" value="${worker ? worker.contractStartDate || '' : ''}"></div>
          <div class="form-group"><label>雇用契約終了日</label><input id="f_contractEndDate" type="date" value="${worker ? worker.contractEndDate || '' : ''}"></div>
        </div>
        <div class="form-group"><label>学歴・職歴</label><input id="f_educationWorkHistory" value="${worker ? escapeHtml(worker.educationWorkHistory) : ''}"></div>
        <div class="form-group">
          <label>ステータス</label>
          <select id="f_currentStage">
            <option value="">選択</option>
            ${this.stageOptions.map((s) => `<option value="${s}" ${worker && worker.currentStage === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>

        <div id="tokuteiSection" hidden>
          <h4 class="section-title">特定技能：法定講習</h4>
          <div class="form-row">
            <div class="form-group"><label>受講状況</label><select id="f_tokuteiTrainingStatus"><option value="">選択</option>${tokuteiOptions}</select></div>
            <div class="form-group"><label>受講・修了日</label><input id="f_tokuteiTrainingDate" type="date" value="${worker ? worker.tokuteiTrainingDate || '' : ''}"></div>
          </div>
        </div>

        <h4 class="section-title">労働条件</h4>
        <div class="form-row">
          <div class="form-group"><label>基本賃金（円）</label><input id="f_baseSalary" type="number" value="${worker && worker.baseSalary ? worker.baseSalary : ''}"></div>
          <div class="form-group"><label>給料支払日</label><input id="f_payDate" placeholder="毎月25日" value="${worker ? escapeHtml(worker.payDate) : ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>始業時刻</label><input id="f_workStartTime" placeholder="8:00" value="${worker ? escapeHtml(worker.workStartTime) : ''}"></div>
          <div class="form-group"><label>終業時刻</label><input id="f_workEndTime" placeholder="17:00" value="${worker ? escapeHtml(worker.workEndTime) : ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>休日</label><input id="f_holidays" placeholder="土日祝" value="${worker ? escapeHtml(worker.holidays) : ''}"></div>
          <div class="form-group"><label>労働時間（補足）</label><input id="f_workingHours" value="${worker ? escapeHtml(worker.workingHours) : ''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>割増賃金率</label><input id="f_overtimeRate" placeholder="25%" value="${worker ? escapeHtml(worker.overtimeRate) : ''}"></div>
          <div class="form-group"><label>手当</label><input id="f_allowances" value="${worker ? escapeHtml(worker.allowances) : ''}"></div>
        </div>
        <div class="form-group"><label>控除</label><input id="f_deductions" value="${worker ? escapeHtml(worker.deductions) : ''}"></div>
        <div class="form-group"><label>相談窓口</label><input id="f_consultationContact" value="${worker ? escapeHtml(worker.consultationContact) : ''}"></div>
        <div class="form-group"><label>保険加入状況</label><input id="f_insuranceStatus" value="${worker ? escapeHtml(worker.insuranceStatus) : ''}"></div>
        <div class="form-group"><label>宿舎情報</label><input id="f_dormitoryInfo" value="${worker ? escapeHtml(worker.dormitoryInfo) : ''}"></div>
        <div class="form-group"><label>電話番号</label><input id="f_phone" value="${worker ? escapeHtml(worker.phone) : ''}"></div>

        <h4 class="section-title">健康診断</h4>
        <div class="form-group"><label>一般健康診断 最終受診日</label><input id="f_healthCheckDate" type="date" value="${worker ? worker.healthCheckDate || '' : ''}"></div>
        <div id="specialHealthChecksList"></div>

        <div class="form-group"><label>備考</label><input id="f_notes" value="${worker ? escapeHtml(worker.notes) : ''}"></div>

        <div id="formErrors" class="alert-error" hidden></div>
        <button type="submit" class="btn btn-primary">${isEdit ? '更新する' : '登録する'}</button>
      </form>
    `
    );

    const modalBox = document.querySelector('.modal-box');
    if (modalBox) modalBox.style.maxWidth = '640px';

    this.renderSpecialHealthChecksEditor(specialHealthChecks);

    const toggleTokutei = () => {
      document.getElementById('tokuteiSection').hidden = document.getElementById('f_statusType').value !== '特定技能';
    };
    document.getElementById('f_statusType').addEventListener('change', toggleTokutei);
    toggleTokutei();

    document.getElementById('workerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = (id) => document.getElementById(id).value;
      const specialHealthChecks = Array.from(document.querySelectorAll('#specialHealthChecksList tbody tr')).map((row) => ({
        label: row.dataset.label,
        applicable: row.querySelector('.shc-applicable').checked,
        lastExamDate: row.querySelector('.shc-date').value,
      }));
      const body = {
        name: val('f_name'), nameKana: val('f_nameKana'), nationality: val('f_nationality'),
        gender: val('f_gender'), dob: val('f_dob'), homeCountryAddress: val('f_homeCountryAddress'),
        passportNumber: val('f_passportNumber'), passportExpiryDate: val('f_passportExpiryDate'),
        residenceCardNumber: val('f_residenceCardNumber'), statusType: val('f_statusType'),
        visaType: val('f_visaType'), visaExpiryDate: val('f_visaExpiryDate'), entryDate: val('f_entryDate'),
        trainingStartDate: val('f_trainingStartDate'),
        hostCompanyId: val('f_hostCompanyId') || null, sendingOrgId: val('f_sendingOrgId') || null,
        jobCategory: val('f_jobCategory'), contractStartDate: val('f_contractStartDate'),
        contractEndDate: val('f_contractEndDate'), educationWorkHistory: val('f_educationWorkHistory'),
        currentStage: val('f_currentStage'),
        tokuteiTrainingStatus: val('f_tokuteiTrainingStatus'), tokuteiTrainingDate: val('f_tokuteiTrainingDate'),
        baseSalary: val('f_baseSalary') || null, payDate: val('f_payDate'),
        workStartTime: val('f_workStartTime'), workEndTime: val('f_workEndTime'), holidays: val('f_holidays'),
        workingHours: val('f_workingHours'),
        overtimeRate: val('f_overtimeRate'), allowances: val('f_allowances'), deductions: val('f_deductions'),
        healthCheckDate: val('f_healthCheckDate'), specialHealthChecks,
        consultationContact: val('f_consultationContact'),
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

  renderSpecialHealthChecksEditor(existing) {
    const list = document.getElementById('specialHealthChecksList');
    const items = existing || this.specialHealthCheckTypes.map((label) => ({ label, applicable: false, lastExamDate: '' }));
    list.innerHTML = `
      <table>
        <thead><tr><th>対象業務</th><th>該当</th><th>最終受診日</th></tr></thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr data-label="${escapeHtml(item.label)}">
              <td>${escapeHtml(item.label)}</td>
              <td><input type="checkbox" class="shc-applicable" ${item.applicable ? 'checked' : ''}></td>
              <td><input type="date" class="shc-date" value="${item.lastExamDate || ''}"></td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    `;
  },

  async remove(id) {
    if (!confirm('この対象者を削除しますか？')) return;
    await api.del(`/api/workers/${id}`);
    await this.loadStats();
    await this.load();
  },
};
