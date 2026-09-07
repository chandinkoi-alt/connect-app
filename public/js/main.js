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

window.addEventListener('DOMContentLoaded', () => {
  Modal.init();
  const initial = (window.location.hash || '#dashboard').replace('#', '');
  goToTab(TABS[initial] ? initial : 'dashboard');
});
