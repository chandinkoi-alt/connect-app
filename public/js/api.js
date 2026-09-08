function handleAuthFailure(res) {
  if (res.status === 401) {
    window.location.href = '/login.html';
    return true;
  }
  return false;
}

const api = {
  async get(url) {
    const res = await fetch(url);
    if (handleAuthFailure(res)) return new Promise(() => {});
    return res.json();
  },
  async post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (handleAuthFailure(res)) return new Promise(() => {});
    const data = await res.json();
    if (!res.ok) throw data;
    return data;
  },
  async put(url, body) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (handleAuthFailure(res)) return new Promise(() => {});
    const data = await res.json();
    if (!res.ok) throw data;
    return data;
  },
  async del(url) {
    const res = await fetch(url, { method: 'DELETE' });
    if (handleAuthFailure(res)) return new Promise(() => {});
    const data = await res.json();
    if (!res.ok) throw data;
    return data;
  },
};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function formatErrors(err) {
  if (!err) return 'エラーが発生しました。';
  if (err.errors) return err.errors.join(' / ');
  if (err.error) return err.error;
  return 'エラーが発生しました。';
}

// 表の読み込み中プレースホルダー行（丸いスピナー付き）。colspan は列数に合わせる。
function loadingRowHtml(colspan) {
  return `<tr><td colspan="${colspan}"><div class="loading-inline"><span class="spinner"></span> 読み込み中...</div></td></tr>`;
}

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function getExpiryUrgency(dateStr, warningDays = 90) {
  if (!dateStr) return { label: '未設定', level: 'unknown', days: null };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return { label: '未設定', level: 'unknown', days: null };
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target - today) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: '期限切れ', level: 'expired', days };
  if (days <= warningDays) return { label: '期限間近', level: 'warning', days };
  return { label: '正常', level: 'ok', days };
}
