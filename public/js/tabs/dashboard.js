const TabDashboard = {
  currentFilter: '',

  async render(container) {
    container.innerHTML = `
      <section class="stats-bar" id="dashStats"></section>
      <section class="card">
        <div class="card-title-row">
          <h2 class="card-title">対応が必要な項目</h2>
          <select id="taskFilter">
            <option value="">すべて</option>
            <option value="expired">期限切れ・緊急</option>
            <option value="warning">期限間近</option>
          </select>
        </div>
        <div id="taskList"></div>
      </section>
    `;

    document.getElementById('taskFilter').addEventListener('change', (e) => {
      this.currentFilter = e.target.value;
      this.renderTasks();
    });

    await this.loadStats();
    await this.renderTasks();
  },

  async loadStats() {
    const stats = await api.get('/api/dashboard/stats');
    const statsBar = document.getElementById('dashStats');
    statsBar.innerHTML = `
      <div class="stat-card clickable" data-tab="workers"><div class="stat-value">${stats.activeWorkers}</div><div class="stat-label">在籍中の対象者</div></div>
      <div class="stat-card clickable" data-tab="companies"><div class="stat-value">${stats.hostCompanies}</div><div class="stat-label">受入企業数</div></div>
      <div class="stat-card clickable" data-tab="applications"><div class="stat-value">${stats.processingCases}</div><div class="stat-label">処理中の申請</div></div>
      <div class="stat-card expired clickable" data-filter="expired"><div class="stat-value">${stats.urgentCount}</div><div class="stat-label">緊急対応（期限切れ）</div></div>
      <div class="stat-card warning clickable" data-filter="warning"><div class="stat-value">${stats.warningCount}</div><div class="stat-label">要注意（期限間近）</div></div>
    `;
    statsBar.querySelectorAll('[data-tab]').forEach((el) => {
      el.addEventListener('click', () => goToTab(el.dataset.tab));
    });
    statsBar.querySelectorAll('[data-filter]').forEach((el) => {
      el.addEventListener('click', () => {
        this.currentFilter = el.dataset.filter;
        document.getElementById('taskFilter').value = el.dataset.filter;
        this.renderTasks();
      });
    });
  },

  getDismissed() {
    try {
      return JSON.parse(localStorage.getItem('connect_dismissed_tasks') || '[]');
    } catch {
      return [];
    }
  },

  dismiss(taskId) {
    const dismissed = this.getDismissed();
    if (!dismissed.includes(taskId)) dismissed.push(taskId);
    localStorage.setItem('connect_dismissed_tasks', JSON.stringify(dismissed));
  },

  async renderTasks() {
    const tasks = await api.get('/api/dashboard/tasks');
    const dismissed = this.getDismissed();
    let visible = tasks.filter((t) => !dismissed.includes(t.id));
    if (this.currentFilter) visible = visible.filter((t) => t.level === this.currentFilter);

    const listEl = document.getElementById('taskList');
    if (!visible.length) {
      listEl.innerHTML = '<div class="empty-hint">対応が必要な項目はありません。</div>';
      return;
    }

    const badgeClass = { expired: 'badge-expired', warning: 'badge-warning' };
    listEl.innerHTML = `
      <ul class="task-list">
        ${visible
          .map(
            (t) => `
          <li class="task-item">
            <span class="badge ${badgeClass[t.level]}">${t.category}</span>
            <a href="#" class="task-link" data-tab="${t.link.tab}">${escapeHtml(t.title)}</a>
            <span class="task-due">${escapeHtml(t.dueDate)}${t.days !== null ? (t.days < 0 ? `（${Math.abs(t.days)}日超過）` : `（残り${t.days}日）`) : ''}</span>
            <button class="link-btn link-delete" data-dismiss="${t.id}">対応済みにする</button>
          </li>`
          )
          .join('')}
      </ul>
    `;

    listEl.querySelectorAll('a.task-link').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        goToTab(a.dataset.tab);
      });
    });
    listEl.querySelectorAll('button[data-dismiss]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.dismiss(btn.dataset.dismiss);
        this.renderTasks();
      });
    });
  },
};
