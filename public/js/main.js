const TABS = {
  dashboard: TabDashboard,
  recruitment: TabRecruitment,
  sendingOrgs: TabSendingOrgs,
  workers: TabWorkers,
  applications: TabApplications,
  companies: TabCompanies,
  visits: TabVisits,
};

const tabContent = document.getElementById('tabContent');
const tabButtons = document.querySelectorAll('.tab-btn');

function goToTab(name, params) {
  tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === name));
  const tab = TABS[name];
  if (!tab) return;
  const activeBtn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
  const pageTitle = document.getElementById('pageTitle');
  if (activeBtn && pageTitle) pageTitle.textContent = activeBtn.dataset.title;
  tabContent.innerHTML = '';
  tab.render(tabContent, params || {});
  window.location.hash = name;
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => goToTab(btn.dataset.tab));
});

async function checkAuthAndBoot() {
  const res = await fetch('/api/auth/me');
  if (!res.ok) {
    window.location.href = '/login.html';
    return;
  }
  const user = await res.json();

  const userNameEl = document.getElementById('currentUserName');
  if (userNameEl) userNameEl.textContent = user.name || user.username;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login.html';
    });
  }

  const addAccountBtn = document.getElementById('addAccountBtn');
  if (addAccountBtn) {
    addAccountBtn.addEventListener('click', openAddAccountModal);
  }

  Modal.init();
  const initial = (window.location.hash || '#dashboard').replace('#', '');
  goToTab(TABS[initial] ? initial : 'dashboard');
}

function openAddAccountModal() {
  Modal.open(
    '職員アカウントを追加',
    `
    <form id="addAccountForm">
      <div class="form-group"><label>お名前</label><input type="text" id="f_name" placeholder="山田 太郎"></div>
      <div class="form-group"><label>ユーザー名 *</label><input type="text" id="f_username" required minlength="3"></div>
      <div class="form-group"><label>パスワード（6文字以上） *</label><input type="password" id="f_password" required minlength="6"></div>
      <div id="formErrors" class="alert-error" hidden></div>
      <button type="submit" class="btn btn-primary">アカウントを作成する</button>
    </form>
  `
  );

  document.getElementById('addAccountForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      name: document.getElementById('f_name').value,
      username: document.getElementById('f_username').value,
      password: document.getElementById('f_password').value,
    };
    try {
      await api.post('/api/auth/register', body);
      Modal.close();
      alert('アカウントを作成しました。');
    } catch (err) {
      const el = document.getElementById('formErrors');
      el.textContent = formatErrors(err);
      el.hidden = false;
    }
  });
}

window.addEventListener('DOMContentLoaded', checkAuthAndBoot);
