// ブラウザ標準の confirm() は見た目がアプリのデザインと合わないため、削除操作の
// 確認には代わりにこのアプリ内モーダルを使う。await ConfirmDialog.show('...') で
// true/false を受け取れる（native confirm() と同じ使い方ができる）。
const ConfirmDialog = {
  overlay: null,
  messageEl: null,
  okBtn: null,
  cancelBtn: null,
  resolveFn: null,

  init() {
    this.overlay = document.getElementById('confirmOverlay');
    this.messageEl = document.getElementById('confirmMessage');
    this.okBtn = document.getElementById('confirmOkBtn');
    this.cancelBtn = document.getElementById('confirmCancelBtn');
    this.cancelBtn.addEventListener('click', () => this.settle(false));
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.settle(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.overlay.hidden) this.settle(false);
    });
  },

  settle(result) {
    this.overlay.hidden = true;
    if (this.resolveFn) {
      const resolve = this.resolveFn;
      this.resolveFn = null;
      resolve(result);
    }
  },

  show(message, { okLabel = '削除する', danger = true } = {}) {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.messageEl.textContent = message;
      this.okBtn.textContent = okLabel;
      this.okBtn.className = `btn btn-small ${danger ? 'btn-danger' : 'btn-primary'}`;
      this.okBtn.onclick = () => this.settle(true);
      this.overlay.hidden = false;
    });
  },
};
