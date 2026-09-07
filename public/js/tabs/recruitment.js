const TabRecruitment = {
  leadStages: [],
  candidateStages: [],
  sendingOrgs: [],
  activeCompanies: [],
  visaTypes: [],
  statusTypes: [],

  async render(container) {
    container.innerHTML = `
      <section class="card">
        <div class="card-title-row">
          <h2 class="card-title">① 受入企業リード</h2>
          <button class="btn btn-primary btn-small" id="addLeadBtn">＋ 新規リード</button>
        </div>
        <div class="kanban-board" id="leadBoard"></div>
      </section>
      <section class="card" style="margin-top: 20px;">
        <div class="card-title-row">
          <h2 class="card-title">② 候補者パイプライン</h2>
          <button class="btn btn-primary btn-small" id="addCandidateBtn">＋ 新規候補者</button>
        </div>
        <div class="kanban-board" id="candidateBoard"></div>
      </section>
    `;

    [this.leadStages, this.candidateStages, this.sendingOrgs, this.activeCompanies, this.visaTypes, this.statusTypes] =
      await Promise.all([
        api.get('/api/host-companies/lead-stages'),
        api.get('/api/candidates/stages'),
        api.get('/api/sending-orgs'),
        api.get('/api/host-companies?status=active'),
        api.get('/api/workers/visa-types'),
        api.get('/api/workers/status-types'),
      ]);

    document.getElementById('addLeadBtn').addEventListener('click', () => this.openLeadForm());
    document.getElementById('addCandidateBtn').addEventListener('click', () => this.openCandidateForm());

    await Promise.all([this.loadLeads(), this.loadCandidates()]);
  },

  async loadLeads() {
    const leads = await api.get('/api/host-companies?status=lead');
    const board = document.getElementById('leadBoard');
    board.innerHTML = this.leadStages
      .map((stage) => {
        const items = leads.filter((l) => l.leadStage === stage);
        return `
        <div class="kanban-column">
          <div class="kanban-column-title">${escapeHtml(stage)}（${items.length}）</div>
          <div class="kanban-cards">
            ${items.map((l) => this.renderLeadCard(l)).join('') || '<div class="kanban-empty">なし</div>'}
          </div>
        </div>`;
      })
      .join('');

    board.querySelectorAll('select[data-lead-id]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        await api.put(`/api/host-companies/${sel.dataset.leadId}/stage`, { leadStage: sel.value });
        await this.loadLeads();
      });
    });
    board.querySelectorAll('button[data-convert-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('この企業を正式な実習実施者として登録しますか？')) return;
        await api.post(`/api/host-companies/${btn.dataset.convertId}/convert`, {});
        this.activeCompanies = await api.get('/api/host-companies?status=active');
        await this.loadLeads();
      });
    });
  },

  renderLeadCard(lead) {
    const isLast = lead.leadStage === this.leadStages[this.leadStages.length - 1];
    return `
      <div class="kanban-card">
        <div class="kanban-card-title">${escapeHtml(lead.name)}</div>
        <div class="kanban-card-sub">${escapeHtml(lead.address) || '－'}</div>
        <div class="kanban-card-sub">担当: ${escapeHtml(lead.contactPerson) || '－'}</div>
        <select data-lead-id="${lead.id}" class="kanban-select">
          ${this.leadStages.map((s) => `<option value="${s}" ${s === lead.leadStage ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        ${isLast ? `<button class="btn btn-success btn-small" data-convert-id="${lead.id}">実習実施者として登録</button>` : ''}
      </div>`;
  },

  openLeadForm() {
    Modal.open(
      '受入企業リード 新規登録',
      `
      <form id="leadForm">
        <div class="form-group"><label>企業名 *</label><input id="f_name" required></div>
        <div class="form-group"><label>所在地</label><input id="f_address"></div>
        <div class="form-row">
          <div class="form-group"><label>担当者</label><input id="f_contactPerson"></div>
          <div class="form-group"><label>電話番号</label><input id="f_phone"></div>
        </div>
        <div id="formErrors" class="alert-error" hidden></div>
        <button type="submit" class="btn btn-primary">登録する</button>
      </form>
    `
    );
    document.getElementById('leadForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        name: document.getElementById('f_name').value,
        address: document.getElementById('f_address').value,
        contactPerson: document.getElementById('f_contactPerson').value,
        phone: document.getElementById('f_phone').value,
        status: 'lead',
        leadStage: this.leadStages[0],
      };
      try {
        await api.post('/api/host-companies', body);
        Modal.close();
        await this.loadLeads();
      } catch (err) {
        const el = document.getElementById('formErrors');
        el.textContent = formatErrors(err);
        el.hidden = false;
      }
    });
  },

  async loadCandidates() {
    const candidates = await api.get('/api/candidates');
    const board = document.getElementById('candidateBoard');
    const orgMap = Object.fromEntries(this.sendingOrgs.map((o) => [o.id, o.name]));

    board.innerHTML = this.candidateStages
      .map((stage) => {
        const items = candidates.filter((c) => c.stage === stage);
        return `
        <div class="kanban-column">
          <div class="kanban-column-title">${escapeHtml(stage)}（${items.length}）</div>
          <div class="kanban-cards">
            ${items.map((c) => this.renderCandidateCard(c, orgMap)).join('') || '<div class="kanban-empty">なし</div>'}
          </div>
        </div>`;
      })
      .join('');

    board.querySelectorAll('select[data-candidate-id]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        await api.put(`/api/candidates/${sel.dataset.candidateId}/stage`, { stage: sel.value });
        await this.loadCandidates();
      });
    });
    board.querySelectorAll('button[data-hire-id]').forEach((btn) => {
      btn.addEventListener('click', () => this.openHireForm(candidates.find((c) => c.id === Number(btn.dataset.hireId))));
    });
  },

  renderCandidateCard(candidate, orgMap) {
    const stageIdx = this.candidateStages.indexOf(candidate.stage);
    const canHire = stageIdx >= this.candidateStages.length - 2; // 内定 or 採用確定
    return `
      <div class="kanban-card">
        <div class="kanban-card-title">${escapeHtml(candidate.name)}</div>
        <div class="kanban-card-sub">${escapeHtml(candidate.nationality) || '－'}</div>
        <div class="kanban-card-sub">送出: ${escapeHtml(orgMap[candidate.sendingOrgId]) || '－'}</div>
        <select data-candidate-id="${candidate.id}" class="kanban-select">
          ${this.candidateStages.map((s) => `<option value="${s}" ${s === candidate.stage ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        ${canHire ? `<button class="btn btn-success btn-small" data-hire-id="${candidate.id}">技能実習生として登録</button>` : ''}
      </div>`;
  },

  openCandidateForm() {
    Modal.open(
      '候補者 新規登録',
      `
      <form id="candidateForm">
        <div class="form-group"><label>氏名 *</label><input id="f_name" required></div>
        <div class="form-row">
          <div class="form-group"><label>国籍</label><input id="f_nationality"></div>
          <div class="form-group"><label>面接日</label><input id="f_interviewDate" type="date"></div>
        </div>
        <div class="form-group">
          <label>送出機関</label>
          <select id="f_sendingOrgId">
            <option value="">選択してください</option>
            ${this.sendingOrgs.map((o) => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}
          </select>
        </div>
        <div id="formErrors" class="alert-error" hidden></div>
        <button type="submit" class="btn btn-primary">登録する</button>
      </form>
    `
    );
    document.getElementById('candidateForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        name: document.getElementById('f_name').value,
        nationality: document.getElementById('f_nationality').value,
        interviewDate: document.getElementById('f_interviewDate').value,
        sendingOrgId: document.getElementById('f_sendingOrgId').value || null,
      };
      try {
        await api.post('/api/candidates', body);
        Modal.close();
        await this.loadCandidates();
      } catch (err) {
        const el = document.getElementById('formErrors');
        el.textContent = formatErrors(err);
        el.hidden = false;
      }
    });
  },

  openHireForm(candidate) {
    Modal.open(
      `${candidate.name} を実習生・対象者として登録`,
      `
      <form id="hireForm">
        <div class="form-group">
          <label>受入企業 *</label>
          <select id="f_hostCompanyId" required>
            <option value="">選択してください</option>
            ${this.activeCompanies.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>制度区分 *</label>
            <select id="f_statusType" required>
              <option value="">選択してください</option>
              ${this.statusTypes.map((s) => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>在留資格 *</label>
            <select id="f_visaType" required>
              <option value="">選択してください</option>
              ${this.visaTypes.map((v) => `<option value="${v}">${v}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group"><label>在留期限 *</label><input id="f_visaExpiryDate" type="date" required></div>
        <div id="formErrors" class="alert-error" hidden></div>
        <button type="submit" class="btn btn-primary">登録する（認定申請の下書きも自動作成されます）</button>
      </form>
    `
    );
    document.getElementById('hireForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        hostCompanyId: document.getElementById('f_hostCompanyId').value,
        statusType: document.getElementById('f_statusType').value,
        visaType: document.getElementById('f_visaType').value,
        visaExpiryDate: document.getElementById('f_visaExpiryDate').value,
      };
      try {
        await api.post(`/api/candidates/${candidate.id}/hire`, body);
        Modal.close();
        await this.loadCandidates();
        alert('登録が完了しました。「人材360」「認定申請」タブに反映されています。');
      } catch (err) {
        const el = document.getElementById('formErrors');
        el.textContent = formatErrors(err);
        el.hidden = false;
      }
    });
  },
};
