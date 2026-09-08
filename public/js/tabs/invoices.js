const TabInvoices = {
  companies: [],

  async render(container) {
    container.innerHTML = `
      <section class="card">
        <div class="card-title-row">
          <h2 class="card-title">請求書</h2>
          <div class="row-actions">
            <button class="btn btn-secondary btn-small" id="rateSettingsBtn">料金設定</button>
            <button class="btn btn-primary btn-small" id="addInvoiceBtn">＋ 新規請求書作成</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>請求月</th><th>受入企業</th><th>ステータス</th><th>件数</th><th>合計金額</th><th></th></tr>
            </thead>
            <tbody id="invoiceTableBody">${loadingRowHtml(6)}</tbody>
          </table>
        </div>
      </section>
    `;

    this.companies = await api.get('/api/host-companies?status=active');

    document.getElementById('addInvoiceBtn').addEventListener('click', () => this.openCreateForm());
    document.getElementById('rateSettingsBtn').addEventListener('click', () => this.openRateSettings());

    await this.load();
  },

  async load() {
    const list = await api.get('/api/invoices');
    const tbody = document.getElementById('invoiceTableBody');
    if (!tbody) return;
    if (!list.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">請求書が登録されていません。</td></tr>';
      return;
    }
    const badgeClass = { 下書き: 'badge-unknown', 発行済み: 'badge-warning', 支払済み: 'badge-ok' };
    tbody.innerHTML = list
      .map(
        (inv) => `
      <tr>
        <td><a href="#" class="link-view" data-id="${inv.id}">${escapeHtml(inv.billingMonth)}</a></td>
        <td>${escapeHtml(inv.companyName)}</td>
        <td><span class="badge ${badgeClass[inv.status] || 'badge-unknown'}">${escapeHtml(inv.status)}</span></td>
        <td>${inv.itemCount}</td>
        <td>${inv.totalAmount.toLocaleString('ja-JP')}円</td>
        <td class="row-actions">
          <button class="link-btn link-edit" data-id="${inv.id}" data-action="open">開く</button>
          <button class="link-btn link-delete" data-id="${inv.id}" data-action="delete">削除</button>
        </td>
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('a.link-view, button[data-action="open"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.openDetail(Number(el.dataset.id));
      });
    });
    tbody.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await ConfirmDialog.show('この請求書を削除しますか？\nこの操作は取り消せません。'))) return;
        await api.del(`/api/invoices/${btn.dataset.id}`);
        await this.load();
      });
    });
  },

  openCreateForm() {
    Modal.open(
      '新規請求書作成',
      `
      <form id="invoiceForm">
        <div class="form-group">
          <label>受入企業 *</label>
          <select id="f_hostCompanyId" required>
            <option value="">選択してください</option>
            ${this.companies.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>請求月 *</label><input id="f_billingMonth" type="month" required></div>
        <div class="form-row">
          <div class="form-group"><label>発行日</label><input id="f_issueDate" type="date"></div>
          <div class="form-group"><label>支払期限</label><input id="f_dueDate" type="date"></div>
        </div>
        <div class="form-group"><label>備考</label><input id="f_notes"></div>
        <div id="formErrors" class="alert-error" hidden></div>
        <button type="submit" class="btn btn-primary">作成する（在籍する対象者から自動で明細を作成します）</button>
      </form>
    `
    );

    document.getElementById('invoiceForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        hostCompanyId: document.getElementById('f_hostCompanyId').value,
        billingMonth: document.getElementById('f_billingMonth').value,
        issueDate: document.getElementById('f_issueDate').value,
        dueDate: document.getElementById('f_dueDate').value,
        notes: document.getElementById('f_notes').value,
      };
      try {
        const invoice = await api.post('/api/invoices', body);
        await this.load();
        this.openDetail(invoice.id);
      } catch (err) {
        const el = document.getElementById('formErrors');
        el.textContent = formatErrors(err);
        el.hidden = false;
      }
    });
  },

  async openDetail(id) {
    const inv = await api.get(`/api/invoices/${id}`);
    const statuses = await api.get('/api/invoices/statuses');

    Modal.open(
      `請求書（${inv.companyName} / ${inv.billingMonth}）`,
      `
      <div class="form-row">
        <div class="form-group"><label>請求月</label><input id="f_billingMonth" type="month" value="${inv.billingMonth}"></div>
        <div class="form-group"><label>ステータス</label>
          <select id="f_status">${statuses.map((s) => `<option value="${s}" ${s === inv.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>発行日</label><input id="f_issueDate" type="date" value="${inv.issueDate || ''}"></div>
        <div class="form-group"><label>支払期限</label><input id="f_dueDate" type="date" value="${inv.dueDate || ''}"></div>
      </div>
      <div class="form-group"><label>備考</label><input id="f_notes" value="${escapeHtml(inv.notes) || ''}"></div>
      <button class="btn btn-secondary btn-small" id="saveHeaderBtn" style="width:auto;">請求書情報を保存</button>

      <h4 class="section-title">明細</h4>
      <div class="table-wrap">
        <table>
          <thead><tr><th>項目</th><th>数量</th><th>単価</th><th>金額</th><th></th></tr></thead>
          <tbody id="itemsBody">
            ${inv.items
              .map(
                (item) => `
              <tr data-item-id="${item.id}">
                <td><input class="item-desc" value="${escapeHtml(item.description)}" style="min-width:160px;"></td>
                <td><input class="item-qty" type="number" min="0" value="${item.quantity}" style="width:56px;"></td>
                <td><input class="item-price" type="number" min="0" value="${item.unitPrice}" style="width:90px;"></td>
                <td>${item.amount.toLocaleString('ja-JP')}円</td>
                <td><button class="link-btn link-delete" data-action="delete-item" data-id="${item.id}">削除</button></td>
              </tr>`
              )
              .join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align:right; font-weight:bold;">合計</td>
              <td style="font-weight:bold;">${inv.totalAmount.toLocaleString('ja-JP')}円</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <h4 class="section-title">追加項目</h4>
      <div class="form-row">
        <div class="form-group"><label>項目名</label><input id="newItemDesc" placeholder="例: 送迎費"></div>
        <div class="form-group"><label>数量</label><input id="newItemQty" type="number" value="1" min="0"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>単価（円）</label><input id="newItemPrice" type="number" value="0" min="0"></div>
        <div class="form-group" style="align-self:flex-end;"><button class="btn btn-secondary btn-small" id="addItemBtn" style="width:100%;">追加する</button></div>
      </div>

      <div class="form-actions" style="margin-top:15px;">
        <button class="btn btn-success" id="exportInvoiceBtn">📥 Excel出力（簡易版）</button>
      </div>
    `
    );

    const modalBox = document.querySelector('.modal-box');
    if (modalBox) modalBox.style.maxWidth = '760px';

    document.getElementById('saveHeaderBtn').addEventListener('click', async () => {
      await api.put(`/api/invoices/${id}`, {
        billingMonth: document.getElementById('f_billingMonth').value,
        issueDate: document.getElementById('f_issueDate').value,
        dueDate: document.getElementById('f_dueDate').value,
        status: document.getElementById('f_status').value,
        notes: document.getElementById('f_notes').value,
      });
      await this.load();
      this.openDetail(id);
    });

    document.querySelectorAll('#itemsBody tr').forEach((row) => {
      const itemId = row.dataset.itemId;
      const save = async () => {
        await api.put(`/api/invoices/${id}/items/${itemId}`, {
          description: row.querySelector('.item-desc').value,
          quantity: row.querySelector('.item-qty').value,
          unitPrice: row.querySelector('.item-price').value,
        });
        await this.load();
        this.openDetail(id);
      };
      row.querySelectorAll('input').forEach((input) => {
        input.addEventListener('change', save);
      });
    });

    document.querySelectorAll('button[data-action="delete-item"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await ConfirmDialog.show('この明細行を削除しますか？'))) return;
        await api.del(`/api/invoices/${id}/items/${btn.dataset.id}`);
        await this.load();
        this.openDetail(id);
      });
    });

    document.getElementById('addItemBtn').addEventListener('click', async () => {
      const description = document.getElementById('newItemDesc').value;
      if (!description.trim()) return;
      await api.post(`/api/invoices/${id}/items`, {
        description,
        quantity: document.getElementById('newItemQty').value,
        unitPrice: document.getElementById('newItemPrice').value,
      });
      await this.load();
      this.openDetail(id);
    });

    document.getElementById('exportInvoiceBtn').addEventListener('click', () => {
      window.location.href = `/api/invoices/${id}/export`;
    });
  },

  async openRateSettings() {
    const rates = await api.get('/api/billing/rates');
    Modal.open(
      '料金設定（在留資格別の固定月額）',
      `
      <p class="empty-hint" style="margin-bottom:12px;">在留資格ごとの監理費・支援費の固定月額です。新規請求書作成時、この金額を元に対象者ごとの明細が自動作成されます。</p>
      <div id="ratesList">
        ${rates
          .map(
            (r) => `
          <div class="form-group">
            <label>${escapeHtml(r.visaType)}（円/月）</label>
            <input class="rate-input" data-visa-type="${escapeHtml(r.visaType)}" type="number" min="0" value="${r.monthlyFee}">
          </div>`
          )
          .join('')}
      </div>
    `
    );

    document.querySelectorAll('.rate-input').forEach((input) => {
      input.addEventListener('change', async () => {
        await api.put(`/api/billing/rates/${encodeURIComponent(input.dataset.visaType)}`, {
          monthlyFee: input.value,
        });
      });
    });
  },
};
