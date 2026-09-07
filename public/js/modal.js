const Modal = {
  overlay: null,
  titleEl: null,
  bodyEl: null,

  init() {
    this.overlay = document.getElementById('modalOverlay');
    this.titleEl = document.getElementById('modalTitle');
    this.bodyEl = document.getElementById('modalBody');
    document.getElementById('modalCloseBtn').addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
  },

  open(title, bodyHtml) {
    this.titleEl.textContent = title;
    this.bodyEl.innerHTML = bodyHtml;
    this.overlay.hidden = false;
  },

  close() {
    this.overlay.hidden = true;
    this.bodyEl.innerHTML = '';
  },
};
