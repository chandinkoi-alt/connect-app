const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.send('OK'));

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>コネクト協同組合 - 統合管理システム</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    body { display: flex; height: 100vh; background-color: #f4f6f9; color: #333; }

    /* Sidebar Navigation */
    .sidebar { width: 260px; background-color: #1a252f; color: #fff; display: flex; flex-direction: column; }
    .brand { padding: 20px; font-size: 18px; font-weight: bold; background-color: #0f171e; border-bottom: 1px solid #2c3e50; display: flex; flex-direction: column; gap: 5px; }
    .brand-title { color: #3498db; }
    .brand-sub { font-size: 11px; color: #bdc3c7; }
    .nav-menu { list-style: none; margin-top: 15px; flex: 1; }
    .nav-item { padding: 15px 20px; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: 0.2s; font-size: 14px; border-left: 4px solid transparent; }
    .nav-item:hover, .nav-item.active { background-color: #2c3e50; border-left-color: #3498db; color: #fff; }

    /* Main Content Area */
    .main-content { flex: 1; display: flex; flex-direction: column; overflow-y: auto; }
    .topbar { background-color: #fff; padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
    .user-info { font-size: 14px; color: #555; font-weight: 600; }
    
    .content-area { padding: 25px; }
    .page-section { display: none; }
    .page-section.active { display: block; }

    /* Stats Cards */
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 25px; }
    .card { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border-top: 4px solid #3498db; }
    .card-title { font-size: 13px; color: #7f8c8d; font-weight: 600; text-transform: uppercase; }
    .card-value { font-size: 28px; font-weight: bold; color: #2c3e50; margin-top: 10px; }
    .card.warning { border-top-color: #e74c3c; }
    .card.success { border-top-color: #2ecc71; }
    .card.purple { border-top-color: #9b59b6; }

    /* Tables & Forms */
    .data-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .data-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 12px; }
    .data-card-title { font-size: 18px; color: #2c3e50; font-weight: bold; }
    
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; }
    th, td { padding: 12px 15px; border-bottom: 1px solid #eef2f5; }
    th { background-color: #f8f9fa; color: #7f8c8d; font-weight: 600; }
    tr:hover { background-color: #f8f9fa; }
    
    .badge-status { padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
    .status-active { background: #e8f8f5; color: #27ae60; }
    .status-alert { background: #fadbd8; color: #e74c3c; }

    .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px; transition: 0.2s; }
    .btn-primary { background-color: #3498db; color: #fff; }
    .btn-primary:hover { background-color: #2980b9; }
    .btn-success { background-color: #2ecc71; color: #fff; }

    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
    .form-group { display: flex; flex-direction: column; gap: 5px; }
    .form-group label { font-size: 13px; font-weight: 600; color: #555; }
    .form-group input, .form-group select { padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
  </style>
</head>
<body>

  <!-- Sidebar -->
  <div class="sidebar">
    <div class="brand">
      <span class="brand-title">コネクト協同組合</span>
      <span class="brand-sub">統合管理システム (許1808000401)</span>
    </div>
    <ul class="nav-menu">
      <li class="nav-item active" onclick="switchPage('dashboard', this)">📊 ダッシュボード (Tổng quan)</li>
      <li class="nav-item" onclick="switchPage('trainees', this)">👥 実習生・特定技能 (Thực tập sinh)</li>
      <li class="nav-item" onclick="switchPage('companies', this)">🏢 受入企業管理 (Xí nghiệp)</li>
      <li class="nav-item" onclick="switchPage('documents', this)">📄 監査報告書・書類 (Giấy tờ OTIT)</li>
      <li class="nav-item" onclick="switchPage('settings', this)">⚙️ システム設定 (Cài đặt)</li>
    </ul>
  </div>

  <!-- Main Content -->
  <div class="main-content">
    <div class="topbar">
      <h2 id="pageTitle" style="font-size: 18px; color: #2c3e50;">ダッシュボード (Tổng quan)</h2>
      <div class="user-info">👤 監理責任者: 管理員アカウント</div>
    </div>

    <div class="content-area">
      
      <!-- 1. DASHBOARD PAGE -->
      <div id="dashboard" class="page-section active">
        <div class="stats-grid">
          <div class="card success">
            <div class="card-title">総実習生・特定技能数 (Tổng TTS/KTĐĐ)</div>
            <div class="card-value">128 名</div>
          </div>
          <div class="card warning">
            <div class="card-title">ビザ更新期限間近 (Visa sắp hết hạn)</div>
            <div class="card-value">5 名</div>
          </div>
          <div class="card purple">
            <div class="card-title">受入企業数 (Xí nghiệp tiếp nhận)</div>
            <div class="card-value">18 社</div>
          </div>
          <div class="card">
            <div class="card-title">今月の監査予定 (Lịch kiểm tra tháng)</div>
            <div class="card-value">3 件</div>
          </div>
        </div>

        <div class="data-card">
          <div class="data-card-header">
            <div class="data-card-title">⚠️ ビザ・在留期限 アラート (Cảnh báo hạn Visa)</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>氏名 (Họ tên)</th>
                <th>受入企業 (Xí nghiệp)</th>
                <th>在留資格 (Tư cách)</th>
                <th>期限日 (Hạn Visa)</th>
                <th>ステータス (Trạng thái)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>NGUYEN VAN A</td>
                <td>株式会社大阪工業</td>
                <td>技能実習1号</td>
                <td>2026/10/15</td>
                <td><span class="badge-status status-alert">要更新 (Cần gia hạn)</span></td>
              </tr>
              <tr>
                <td>TRAN THI B</td>
                <td>トヨタ金属株式会社</td>
                <td>特定技能1号</td>
                <td>2026/11/01</td>
                <td><span class="badge-status status-active">準備中 (Đang chuẩn bị)</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 2. TRAINEES PAGE -->
      <div id="trainees" class="page-section">
        <div class="data-card" style="margin-bottom: 20px;">
          <div class="data-card-header">
            <div class="data-card-title">新規実習生登録 (Thêm Thực tập sinh mới)</div>
          </div>
          <div class="form-grid">
            <div class="form-group"><label>氏名 (Họ và tên):</label><input type="text" id="tName" placeholder="例: LE VAN C"></div>
            <div class="form-group"><label>受入企業 (Xí nghiệp):</label><input type="text" id="tCompany" placeholder="例: 株式会社関西建設"></div>
            <div class="form-group"><label>在留資格 (Visa):</label>
              <select id="tVisa">
                <option>技能実習1号</option><option>技能実習2号</option><option>特定技能1号</option>
              </select>
            </div>
            <div class="form-group"><label>入国日 (Ngày nhập cảnh):</label><input type="date" id="tDate"></div>
          </div>
          <button class="btn btn-success" onclick="addTrainee()">+ 登録 (Thêm vào hệ thống)</button>
        </div>

        <div class="data-card">
          <div class="data-card-header">
            <div class="data-card-title">実習生一覧 (Danh sách Quản lý)</div>
          </div>
          <table id="traineeTable">
            <thead>
              <tr>
                <th>ID</th><th>氏名 (Họ tên)</th><th>受入企業 (Xí nghiệp)</th><th>在留資格 (Visa)</th><th>入国日 (Ngày vào)</th><th>操作 (Thao tác)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>TTS001</td><td>NGUYEN VAN A</td><td>株式会社大阪工業</td><td>技能実習1号</td><td>2024/05/10</td>
                <td><button class="btn btn-primary" style="padding:4px 8px; font-size:11px;">詳細 (Chi tiết)</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 3. COMPANIES PAGE -->
      <div id="companies" class="page-section">
        <div class="data-card">
          <div class="data-card-header">
            <div class="data-card-title">受入企業一覧 (Danh sách Xí nghiệp tiếp nhận)</div>
            <button class="btn btn-primary">+ 企業追加 (Thêm Xí nghiệp)</button>
          </div>
          <table>
            <thead>
              <tr><th>企業名 (Tên công ty)</th><th>代表者 (Người đại diện)</th><th>住所 (Địa chỉ)</th><th>配属人数 (Số TTS)</th></tr>
            </thead>
            <tbody>
              <tr><td>株式会社大阪工業</td><td>山田 太郎</td><td>大阪府豊中市...</td><td>12名</td></tr>
              <tr><td>トヨタ金属株式会社</td><td>佐藤 健</td><td>愛知県名古屋市...</td><td>25名</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 4. DOCUMENTS PAGE -->
      <div id="documents" class="page-section">
        <div class="data-card">
          <div class="data-card-header">
            <div class="data-card-title">書類作成・監査報告書 (Tự động xuất Giấy tờ OTIT)</div>
          </div>
          <p style="margin-bottom: 15px; color: #666; font-size: 14px;">Chọn loại biểu mẫu cần xuất cho xí nghiệp:</p>
          <div class="form-grid">
            <div class="form-group">
              <label>対象企業 (Chọn Xí nghiệp):</label>
              <select><option>株式会社大阪工業</option><option>トヨタ金属株式会社</option></select>
            </div>
            <div class="form-group">
              <label>書類種別 (Loại giấy tờ):</label>
              <select>
                <option>実習実施者 監査報告書 (Báo cáo kiểm tra 監査報告書)</option>
                <option>訪問指導記録書 (Sổ tay hướng dẫn tuần tra)</option>
                <option>在留資格更新許可申請書 (Đơn gia hạn Visa)</option>
              </select>
            </div>
          </div>
          <button class="btn btn-primary" onclick="alert('Thành công! Đang tự động điền dữ liệu và tạo file PDF/Print...')">📄 書類を作成・印刷 (Tạo & In Báo Cáo)</button>
        </div>
      </div>

      <!-- 5. SETTINGS PAGE -->
      <div id="settings" class="page-section">
        <div class="data-card">
          <div class="data-card-header"><div class="data-card-title">組合情報設定 (Cài đặt Nghiệp đoàn)</div></div>
          <div class="form-group" style="margin-bottom: 10px;"><label>組合名:</label><input type="text" value="コネクト協同組合" disabled></div>
          <div class="form-group" style="margin-bottom: 10px;"><label>許可番号:</label><input type="text" value="許1808000401" disabled></div>
        </div>
      </div>

    </div>
  </div>

  <script>
    function switchPage(pageId, element) {
      document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      
      document.getElementById(pageId).classList.add('active');
      element.classList.add('active');
      document.getElementById('pageTitle').innerText = element.innerText;
    }

    function addTrainee() {
      const name = document.getElementById('tName').value;
      const comp = document.getElementById('tCompany').value;
      const visa = document.getElementById('tVisa').value;
      const date = document.getElementById('tDate').value;

      if(!name || !comp) { alert('Vui lòng nhập đầy đủ Họ tên và Xí nghiệp!'); return; }

      const table = document.getElementById('traineeTable').getElementsByTagName('tbody')[0];
      const newRow = table.insertRow();
      const count = table.rows.length;

      newRow.innerHTML = `
        <td>TTS00\${count}</td>
        <td>\${name}</td>
        <td>\${comp}</td>
        <td>\${visa}</td>
        <td>\${date || '未設定'}</td>
        <td><button class="btn btn-primary" style="padding:4px 8px; font-size:11px;">詳細 (Chi tiết)</button></td>
      `;

      alert('Đã thêm thành công Thực tập sinh: ' + name);
      document.getElementById('tName').value = '';
      document.getElementById('tCompany').value = '';
    }
  </script>
</body>
</html>
  `);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
