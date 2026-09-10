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
        <div class="field-hint" style="margin-bottom:12px;">提出期限が近い・過ぎている案件ほど上に表示されます。提出期限が未入力の案件は、対象者の在留期限から算出した目安の期限（「（目安）」表示）で並び替えます。認定済みは末尾に表示されます。</div>
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
    // 特定技能は技能実習計画認定申請書の対象外のため、過去データ等で万一
    // 混ざっていても一覧には表示しない。
    const cases = (await api.get(`/api/application-cases?${params.toString()}`)).filter(
      (c) => c.statusType !== '特定技能'
    );
    const tbody = document.getElementById('caseTableBody');
    if (!cases.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="9">申請案件が登録されていません。</td></tr>';
      return;
    }
    tbody.innerHTML = cases
      .map((c) => {
        const done = c.checklist.filter((i) => i.done).length;
        const isDone = c.status === '認定済み';
        // 提出期限：入力済みならそのまま、未入力なら在留期限から算出した
        // 目安期限（isEstimated）を「（目安）」付きで示す。どちらも無ければ「－」。
        let dueDateCell = '－';
        if (isDone) {
          dueDateCell = escapeHtml(c.dueDate) || '－';
        } else if (c.dueDate) {
          dueDateCell = `<span class="badge badge-${c.urgencyLevel}">${escapeHtml(c.dueDate)}</span>`;
        } else if (c.isEstimated && c.effectiveDueDate) {
          dueDateCell = `<span class="badge badge-${c.urgencyLevel}">${escapeHtml(c.effectiveDueDate)}（目安）</span>`;
        }
        return `
        <tr class="${isDone ? 'row-dimmed' : ''}">
          <td>${c.workerPersonalNo ?? '－'}</td>
          <td>${escapeHtml(c.workerName)}</td>
          <td>${escapeHtml(c.companyName)}</td>
          <td>${escapeHtml(c.statusType)}</td>
          <td>${escapeHtml(c.stage) || '－'}</td>
          <td><span class="badge badge-${c.status === '認定済み' ? 'ok' : c.status === '追加書類対応中' ? 'warning' : 'unknown'}">${escapeHtml(c.status)}</span></td>
          <td>${dueDateCell}</td>
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
    // 技能実習計画認定申請書は技能実習・育成就労のみ対象で、特定技能では不要な
    // 手続きのため、対象者・制度区分の候補から特定技能を除く（既存データの
    // 編集で特定技能が選ばれている場合はそのまま維持できるよう残す）。
    const selectableWorkers = this.workers.filter(
      (w) => w.statusType !== '特定技能' || (item && item.workerId === w.id)
    );
    const workerLabel = (w) => `${w.personalNo ? 'No.' + w.personalNo + ' ' : ''}${escapeHtml(w.name)}（${escapeHtml(w.companyName)}）`;
    const workerOptions = selectableWorkers
      .map((w) => `<option value="${w.id}" ${item && item.workerId === w.id ? 'selected' : ''}>${workerLabel(w)}</option>`)
      .join('');
    // 新規登録時は、同じ会社・同じ内容で複数の対象者に一括登録できるよう
    // チェックボックスで複数選択できるようにする（編集時は対象者を後から
    // 変更できないため、従来どおり1件のプルダウンのまま）。
    const workerCheckboxesHtml = selectableWorkers
      .map((w) => `<li><label><input type="checkbox" class="worker-checkbox" value="${w.id}"> ${workerLabel(w)}</label></li>`)
      .join('');
    const selectableStatusTypes = this.statusTypes.filter(
      (s) => s !== '特定技能' || (item && item.statusType === s)
    );
    const statusTypeOptions = selectableStatusTypes
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

      <div id="trainingScheduleSection">
        <h4 class="section-title">実習実施予定表（第4面、1号のみ）</h4>
        <div class="form-row">
          <div class="form-group"><label>使用する素材、材料等</label><input id="f_trainingMaterials" value="${item ? escapeHtml(item.trainingMaterials) : ''}"></div>
          <div class="form-group"><label>使用する機械、器具等</label><input id="f_trainingTools" value="${item ? escapeHtml(item.trainingTools) : ''}"></div>
        </div>
        <div class="form-group">
          <label>技能実習の内容 <span class="field-hint">実物様式の「矢印で結ぶ」表現を、開始月・終了月・月あたり時間数の3項目で簡略化して入力します（最大7件）</span></label>
          <div id="trainingItemsList"></div>
          <button type="button" class="btn btn-secondary btn-small" id="addTrainingItemBtn" style="width:auto; margin-top:8px;">＋ 内容を追加</button>
        </div>
      </div>
    `;

    Modal.open(
      isEdit ? '認定申請 編集' : '認定申請 新規登録',
      `
      <form id="caseForm">
        ${isEdit
          ? `<div class="form-group"><label>対象者 *</label><select id="f_workerId" required disabled><option value="">選択してください</option>${workerOptions}</select></div>`
          : `<div class="form-group">
               <label>対象者 * <span class="field-hint">同じ会社・同じ内容の申請案件を複数の対象者にまとめて登録できます（2名以上選択可）</span></label>
               <ul class="checklist worker-checklist" id="workerCheckboxList">${workerCheckboxesHtml || '<li>対象者が登録されていません。</li>'}</ul>
             </div>`
        }
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
        <div class="form-group">
          <label>認定番号 <span class="field-hint">認定済みになったらOTITから付与される番号を記入してください。次の号（2号・3号）の申請案件を作る際、前段階の目標達成状況欄へ自動的に引き継がれます。</span></label>
          <input id="f_approvalNumber" value="${item ? escapeHtml(item.approvalNumber) : ''}">
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

    // 実習実施予定表（第4面）は1号（A・D）のみ対象。技能実習の内容は最大7件まで、
    // 画面上のみの一覧として保持し、フォーム送信時にまとめてJSONで保存する。
    const MAX_TRAINING_ITEMS = 7;
    const DUTY_TYPES = ['必須業務', '関連業務', '周辺業務'];
    let trainingItems = (item && Array.isArray(item.trainingContentItems) ? item.trainingContentItems : []).map((i) => ({
      content: i.content || '',
      dutyType: i.dutyType || '',
      instructorInfo: i.instructorInfo || '',
      workplace: i.workplace || '',
      startMonth: i.startMonth || '',
      endMonth: i.endMonth || '',
      hoursPerMonth: i.hoursPerMonth || '',
      totalHours: i.totalHours || '',
    }));

    const renderTrainingItems = () => {
      const listEl = document.getElementById('trainingItemsList');
      listEl.innerHTML = trainingItems
        .map(
          (t, i) => `
        <div class="card" style="padding:12px; margin-bottom:8px; background:var(--color-bg);">
          <div class="form-row">
            <div class="form-group"><label>${i + 1}. 内容</label><input data-ti="${i}" data-field="content" value="${escapeHtml(t.content)}"></div>
            <div class="form-group"><label>区分</label><select data-ti="${i}" data-field="dutyType"><option value="">選択</option>${DUTY_TYPES.map((d) => `<option value="${d}" ${t.dutyType === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>指導員（役職・氏名・経験年数）</label><input data-ti="${i}" data-field="instructorInfo" value="${escapeHtml(t.instructorInfo)}"></div>
            <div class="form-group"><label>事業所</label><input data-ti="${i}" data-field="workplace" value="${escapeHtml(t.workplace)}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>開始月</label><input data-ti="${i}" data-field="startMonth" type="number" min="1" max="12" value="${escapeHtml(t.startMonth)}"></div>
            <div class="form-group"><label>終了月</label><input data-ti="${i}" data-field="endMonth" type="number" min="1" max="12" value="${escapeHtml(t.endMonth)}"></div>
            <div class="form-group"><label>月あたり時間数</label><input data-ti="${i}" data-field="hoursPerMonth" type="number" value="${escapeHtml(t.hoursPerMonth)}"></div>
            <div class="form-group"><label>合計時間</label><input data-ti="${i}" data-field="totalHours" type="number" value="${escapeHtml(t.totalHours)}"></div>
          </div>
          <button type="button" class="btn btn-secondary btn-small" data-remove-ti="${i}" style="width:auto;">削除</button>
        </div>`
        )
        .join('');
      listEl.querySelectorAll('[data-ti]').forEach((el) => {
        el.addEventListener('input', () => {
          trainingItems[Number(el.dataset.ti)][el.dataset.field] = el.value;
        });
      });
      listEl.querySelectorAll('[data-remove-ti]').forEach((btn) => {
        btn.addEventListener('click', () => {
          trainingItems.splice(Number(btn.dataset.removeTi), 1);
          renderTrainingItems();
        });
      });
      const addBtn = document.getElementById('addTrainingItemBtn');
      if (addBtn) addBtn.disabled = trainingItems.length >= MAX_TRAINING_ITEMS;
    };
    renderTrainingItems();
    document.getElementById('addTrainingItemBtn').addEventListener('click', () => {
      if (trainingItems.length >= MAX_TRAINING_ITEMS) return;
      trainingItems.push({ content: '', dutyType: '', instructorInfo: '', workplace: '', startMonth: '', endMonth: '', hoursPerMonth: '', totalHours: '' });
      renderTrainingItems();
    });

    const toggleTrainingSchedule = () => {
      const planType = document.getElementById('f_planType').value;
      document.getElementById('trainingScheduleSection').hidden = !['A', 'D'].includes(planType);
    };
    document.getElementById('f_planType').addEventListener('change', toggleTrainingSchedule);
    toggleTrainingSchedule();

    // 新規登録時、対象者を1名だけ選んだ場合は、その対象者の直近の申請案件
    // （1号→2号→3号 の更新など）から、職種・計画指導担当者・使用する素材/機械、
    // 前段階の目標達成状況を自動的に引き継ぐ（既に入力済みの欄は上書きしない）。
    // 制度区分も、前回がA・Bなら次はB・C、D・Eなら次はE・Fを自動選択する。
    if (!isEdit) {
      const PLAN_PROGRESSION = { A: 'B', B: 'C', D: 'E', E: 'F' };
      const setIfEmpty = (id, value) => {
        const el = document.getElementById(id);
        if (el && !el.value && value) el.value = value;
      };
      const autoFillFromPreviousCase = async () => {
        const checked = Array.from(document.querySelectorAll('.worker-checkbox:checked'));
        if (checked.length !== 1) return;
        const workerId = checked[0].value;
        let prevCases;
        try {
          prevCases = await api.get(`/api/application-cases?workerId=${workerId}`);
        } catch {
          return;
        }
        if (!prevCases.length) return;
        const latest = prevCases.reduce((a, b) => (b.id > a.id ? b : a));

        setIfEmpty('f_jobCategoryCode', latest.jobCategoryCode);
        setIfEmpty('f_jobCategoryName', latest.jobCategoryName);
        setIfEmpty('f_workName', latest.workName);
        setIfEmpty('f_jobCategoryFreeText', latest.jobCategoryFreeText);
        setIfEmpty('f_planGuidanceStaffName', latest.planGuidanceStaffName);
        setIfEmpty('f_trainingMaterials', latest.trainingMaterials);
        setIfEmpty('f_trainingTools', latest.trainingTools);
        // 前段階（今回作る案件から見て1つ前の号）の目標達成状況として、
        // 直近の案件自体の目標・認定番号を引き継ぐ。
        setIfEmpty('f_priorStageGoalType', latest.trainingGoalType);
        setIfEmpty('f_priorStageGoalDetail', latest.trainingGoalDetail);
        setIfEmpty('f_priorApprovalNumber', latest.approvalNumber);

        const planTypeSelect = document.getElementById('f_planType');
        if (planTypeSelect && !planTypeSelect.value && PLAN_PROGRESSION[latest.planType]) {
          planTypeSelect.value = PLAN_PROGRESSION[latest.planType];
          planTypeSelect.dispatchEvent(new Event('change'));
        }

        const el = document.getElementById('formErrors');
        if (el) {
          el.textContent = `${escapeHtml(checked[0].closest('label').textContent.trim())} の前回の申請案件の内容を一部反映しました。内容をご確認ください。`;
          el.classList.remove('alert-error');
          el.classList.add('alert-info');
          el.hidden = false;
        }
      };
      document.querySelectorAll('.worker-checkbox').forEach((cb) => {
        cb.addEventListener('change', autoFillFromPreviousCase);
      });
    }

    document.getElementById('caseForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = (id) => document.getElementById(id).value;

      let workerIds;
      if (isEdit) {
        workerIds = [item.workerId];
      } else {
        workerIds = Array.from(document.querySelectorAll('.worker-checkbox:checked')).map((cb) => cb.value);
        if (!workerIds.length) {
          const el = document.getElementById('formErrors');
          el.classList.remove('alert-info');
          el.classList.add('alert-error');
          el.textContent = '対象者を1名以上選択してください。';
          el.hidden = false;
          return;
        }
      }

      const baseBody = {
        statusType: val('f_statusType'),
        stage: val('f_stage'),
        status: val('f_status'),
        dueDate: val('f_dueDate'),
        submittedDate: val('f_submittedDate'),
        approvedDate: val('f_approvedDate'),
        approvalNumber: val('f_approvalNumber'),
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
        trainingMaterials: val('f_trainingMaterials'),
        trainingTools: val('f_trainingTools'),
        trainingContentItems: trainingItems.filter((t) => t.content.trim()),
      };
      try {
        if (isEdit) {
          await api.put(`/api/application-cases/${item.id}`, { ...baseBody, workerId: workerIds[0] });
        } else {
          // 複数選択されている場合は、同じ内容で対象者の数だけ順番に登録する。
          // 途中で失敗した場合、それより前の分は既に登録済みのまま止め、
          // どの対象者で失敗したかをエラーに含める（未登録分だけ選び直して再送できる）。
          for (const workerId of workerIds) {
            try {
              await api.post('/api/application-cases', { ...baseBody, workerId });
            } catch (err) {
              const worker = selectableWorkers.find((w) => String(w.id) === String(workerId));
              throw new Error(`${worker ? worker.name : workerId}: ${formatErrors(err)}`);
            }
          }
        }
        Modal.close();
        await this.load();
      } catch (err) {
        const el = document.getElementById('formErrors');
        el.classList.remove('alert-info');
        el.classList.add('alert-error');
        el.textContent = err.message || formatErrors(err);
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
