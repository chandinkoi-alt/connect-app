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

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
