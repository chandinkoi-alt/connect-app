const TabApplications = {
  statuses: [],
  statusTypes: [],
  workers: [],
  planTypes: [],

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
            <tbody id="caseTableBody">${loadingRowHtml(9)}</tbody>
          </table>
        </div>
      </section>
    `;

    [this.statuses, this.statusTypes, this.workers, this.planTypes] = await Promise.all([
      api.get('/api/application-cases/statuses'),
      api.get('/api/workers/status-types'),
      api.get('/api/workers'),
      api.get('/api/application-cases/plan-types'),
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

    const planTypeOptions = this.planTypes
      .map((p) => `<option value="${p.code}" ${item && item.planType === p.code ? 'selected' : ''}>${p.label}</option>`)
      .join('');
    const GOAL_TYPES = ['技能検定', '技能実習評価試験', 'その他'];
    const goalSelect = (id, current) =>
      `<select id="${id}"><option value="">選択</option>${GOAL_TYPES.map((o) => `<option value="${o}" ${current === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    const yesNoSelect = (id, current) =>
      `<select id="${id}"><option value="">選択</option><option value="有" ${current === '有' ? 'selected' : ''}>有</option><option value="無" ${current === '無' ? 'selected' : ''}>無</option></select>`;

    // 技能実習計画認定申請書は「技能実習」の申請案件にのみ関係する（第1段階では第1・2・7面のみ対応）
    const ninteiHtml = `
      <div class="card-title-row">
        <h4 class="section-title" style="margin:0;">技能実習計画認定申請書（第1・2・7面）</h4>
        ${isEdit ? `<button type="button" class="btn btn-secondary btn-small" id="ninteiPdfBtn" style="width:auto;">PDF出力</button>` : ''}
      </div>
      <div class="form-row">
        <div class="form-group"><label>技能実習の区分</label><select id="f_planType"><option value="">選択</option>${planTypeOptions}</select></div>
        <div class="form-group"><label>計画指導担当者</label><input id="f_planGuidanceStaffName" value="${item ? escapeHtml(item.planGuidanceStaffName) : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>申請日</label><input id="f_applicationDate" type="date" value="${item ? item.applicationDate || '' : ''}"></div>
        <div class="form-group"><label>計画作成日</label><input id="f_planCreationDate" type="date" value="${item ? item.planCreationDate || '' : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>職種コード</label><input id="f_jobCategoryCode" value="${item ? escapeHtml(item.jobCategoryCode) : ''}"></div>
        <div class="form-group"><label>職種名</label><input id="f_jobCategoryName" value="${item ? escapeHtml(item.jobCategoryName) : ''}"></div>
        <div class="form-group"><label>作業名</label><input id="f_workName" value="${item ? escapeHtml(item.workName) : ''}"></div>
      </div>
      <div class="form-group"><label>職種・作業（移行対象職種以外の場合の自由記述）</label><input id="f_jobCategoryFreeText" value="${item ? escapeHtml(item.jobCategoryFreeText) : ''}"></div>
      <div class="form-row">
        <div class="form-group"><label>技能実習の目標</label>${goalSelect('f_trainingGoalType', item ? item.trainingGoalType : '')}</div>
        <div class="form-group"><label>目標の内容（試験名・級 等）</label><input id="f_trainingGoalDetail" value="${item ? escapeHtml(item.trainingGoalDetail) : ''}"></div>
      </div>
      <div id="priorStageSection">
        <div class="form-row">
          <div class="form-group"><label>前段階の目標達成状況</label>${goalSelect('f_priorStageGoalType', item ? item.priorStageGoalType : '')}</div>
          <div class="form-group"><label>前段階の達成内容</label><input id="f_priorStageGoalDetail" value="${item ? escapeHtml(item.priorStageGoalDetail) : ''}"></div>
        </div>
        <div class="form-group"><label>前段階の技能実習計画の認定番号</label><input id="f_priorApprovalNumber" value="${item ? escapeHtml(item.priorApprovalNumber) : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>実習期間 開始</label><input id="f_trainingPeriodStart" type="date" value="${item ? item.trainingPeriodStart || '' : ''}"></div>
        <div class="form-group"><label>実習期間 終了</label><input id="f_trainingPeriodEnd" type="date" value="${item ? item.trainingPeriodEnd || '' : ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>入国後講習時間数</label><input id="f_orientationHours" type="number" value="${item && item.orientationHours ? item.orientationHours : ''}"></div>
        <div class="form-group"><label>実習時間数</label><input id="f_practicalHours" type="number" value="${item && item.practicalHours ? item.practicalHours : ''}"></div>
      </div>
      <div class="form-group"><label>過去1年以内の技能実習実施困難時届出書の提出有無</label>${yesNoSelect('f_hasDifficultyNotification', item ? item.hasDifficultyNotification : '')}</div>
      <div class="form-group"><label>備考（第11号）</label><input id="f_remarks" value="${item ? escapeHtml(item.remarks) : ''}"></div>
    `;

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

        <div id="ninteiSection">${ninteiHtml}</div>

        <div id="formErrors" class="alert-error" hidden></div>
        <button type="submit" class="btn btn-primary">${isEdit ? '更新する' : '登録する'}</button>
      </form>
      ${checklistHtml}
    `
    );

    const modalBox = document.querySelector('.modal-box');
    if (modalBox) modalBox.style.maxWidth = '680px';

    if (isEdit) {
      document.getElementById('checklistList').querySelectorAll('input[type=checkbox]').forEach((cb) => {
        cb.addEventListener('change', async () => {
          await api.put(`/api/application-cases/${item.id}/checklist`, { index: Number(cb.dataset.index), done: cb.checked });
          await this.load();
        });
      });
      const pdfBtn = document.getElementById('ninteiPdfBtn');
      if (pdfBtn) pdfBtn.addEventListener('click', () => window.open(`/api/application-cases/${item.id}/pdf`, '_blank'));
    }

    const toggleNinteiSection = () => {
      document.getElementById('ninteiSection').hidden = document.getElementById('f_statusType').value !== '技能実習';
    };
    document.getElementById('f_statusType').addEventListener('change', toggleNinteiSection);
    toggleNinteiSection();

    // 前段階の目標達成状況は2号・3号（B・C・E・F）の申請にのみ関係する
    const togglePriorStage = () => {
      const planType = document.getElementById('f_planType').value;
      document.getElementById('priorStageSection').hidden = !['B', 'C', 'E', 'F'].includes(planType);
    };
    document.getElementById('f_planType').addEventListener('change', togglePriorStage);
    togglePriorStage();

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
        planType: val('f_planType'),
        planGuidanceStaffName: val('f_planGuidanceStaffName'),
        applicationDate: val('f_applicationDate'),
        planCreationDate: val('f_planCreationDate'),
        jobCategoryCode: val('f_jobCategoryCode'),
        jobCategoryName: val('f_jobCategoryName'),
        workName: val('f_workName'),
        jobCategoryFreeText: val('f_jobCategoryFreeText'),
        trainingGoalType: val('f_trainingGoalType'),
        trainingGoalDetail: val('f_trainingGoalDetail'),
        priorStageGoalType: val('f_priorStageGoalType'),
        priorStageGoalDetail: val('f_priorStageGoalDetail'),
        priorApprovalNumber: val('f_priorApprovalNumber'),
        trainingPeriodStart: val('f_trainingPeriodStart'),
        trainingPeriodEnd: val('f_trainingPeriodEnd'),
        orientationHours: val('f_orientationHours') || null,
        practicalHours: val('f_practicalHours') || null,
        hasDifficultyNotification: val('f_hasDifficultyNotification'),
        remarks: val('f_remarks'),
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
    if (!(await ConfirmDialog.show('この申請案件を削除しますか？\nこの操作は取り消せません。'))) return;
    await api.del(`/api/application-cases/${id}`);
    await this.load();
  },
};
