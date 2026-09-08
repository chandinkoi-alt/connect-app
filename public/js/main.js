const TABS = {
  dashboard: TabDashboard,
  recruitment: TabRecruitment,
  sendingOrgs: TabSendingOrgs,
  workers: TabWorkers,
  applications: TabApplications,
  companies: TabCompanies,
  invoices: TabInvoices,
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

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login.html';
    });
  }

  Modal.init();
  ConfirmDialog.init();
  const initial = (window.location.hash || '#dashboard').replace('#', '');
  goToTab(TABS[initial] ? initial : 'dashboard');

  const bootOverlay = document.getElementById('bootOverlay');
  if (bootOverlay) bootOverlay.hidden = true;
}

window.addEventListener('DOMContentLoaded', checkAuthAndBoot);

// ブラウザの戻る/進むでbfcacheから復元された場合、ログアウト後の古い画面が
// 一瞬表示されるのを防ぐため強制的に再読み込みする
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});
