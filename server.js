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
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
    body { display: flex; height: 100vh; background-color: #f4f6f9; color: #333; }
    .sidebar { width: 260px; background-color: #1a252f; color: #fff; display: flex; flex-direction: column; }
    .brand { padding: 20px; font-size: 16px; font-weight: bold; background-color: #0f171e; border-bottom: 1px solid #2c3e50; }
    .brand-sub { font-size: 11px; color: #bdc3c7; font-weight: normal; display: block; margin-top: 4px; }
    .nav-menu { list-style: none; margin-top: 15px; flex: 1; }
    .nav-item { padding: 15px 20px; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 14px; border-left: 4px solid transparent; }
    .nav-item:hover, .nav-item.active { background-color: #2c3e50; border-left-color: #3498db; color: #fff; }
    .main-content { flex: 1; display: flex; flex-direction: column; overflow-y: auto; }
    .topbar { background-color: #fff; padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
    .content-area { padding: 25px; }
    .page-section { display: none; }
    .page-section.active { display: block; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 25px; }
    .card { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border-top: 4px solid #3498db; }
    .card-title { font-size: 12px; color: #7f8c8d; font-weight: bold; text-transform: uppercase; }
    .card-value { font-size: 26px; font-weight: bold; color: #2c3e50; margin-top: 8px; }
    .data-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 20px; }
    .data-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
    .data-card-title { font-size: 16px; color: #2c3e50; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; }
    th, td { padding: 12px; border-bottom: 1px solid #eef2f5; }
    th { background-color: #f8f9fa; color: #7f8c8d; }
    .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px; }
    .btn-primary { background-color: #3498db; color: #fff; }
    .btn-success { background-color: #2ecc71; color: #fff; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
    .form-group { display: flex; flex-direction: column; gap: 5px; }
    .form-group label { font-size: 13px; font-weight: bold; color: #555; }
    .form-group input, .form-group select { padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
  </style>
</head>
<body>

  <div class="sidebar">
    <div class="brand">
      コネクト協同組合
      <span class="brand-sub">統合管理システム (許1808000401)</span>
    </div>
    <ul class="nav-menu">
      <li class="nav-item active" onclick="switchPage('dashboard', this)">📊 ダッシュボード (Tổng quan)</li>
      <li class="nav-item" onclick="switchPage('trainees', this)">👥 実習生・特定技能 (Thực tập sinh)</li>
      <li class="nav-item" onclick="switchPage('companies', this)">🏢 受入企業管理 (Xí nghiệp)</li>
      <li class="nav-item" onclick="switchPage('documents', this)">📄 書類作成 (Giấy tờ OTIT)</li>
    </ul>
  </div>

  <div class="main-content">
    <div class="topbar">
      <h2 id="pageTitle" style="font-size: 18px;">ダッシュボード (Tổng quan)</h2>
      <div style="font-size: 14px;">👤 監理責任者: 管理員アカウント</div>
    </div>

    <div class="content-area">
      <div id="dashboard" class="page-section active">
        <div class="stats-grid">
          <div class="card" style="border-top-color: #2ecc71;">
            <div class="card-title">総実習生・特定技能数</div>
            <div class="card-value">128 名</div>
          </div>
          <div class="card" style="border-top-color: #e74c3c;">
            <div class="card-title">ビザ更新期限間近</div>
            <div class="card-value">5 名</div>
          </div>
          <div class="card" style="border-top-color: #9b59b6;">
            <div class="card-title">受入企業数</div>
            <div class="card-value">18 社</div>
          </div>
        </div>

        <div class="data-card">
          <div class="data-card-header">
            <div class="data-card-title">⚠️ ビザ・在留期限 アラート (Cảnh báo Visa)</div>
          </div>
          <table>
            <thead>
              <tr><th>氏名</th><th>受入企業</th><th>在留資格</th><th>期限日</th></tr>
            </thead>
            <tbody>
              <tr><td>NGUYEN VAN A</td><td>株式会社大阪工業</td><td>技能実習1号</td><td>2026/10/15</td></tr>
              <tr><td>TRAN THI B</td><td>トヨタ金属株式会社</td><td>特定技能1号</td><td>2026/11/01</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div id="trainees" class="page-section">
        <div class="data-card">
          <div class="data-card-header"><div class="data-card-title">新規実習生登録 (Thêm TTS mới)</div></div>
          <div class="form-grid">
            <div class="form-group"><label>氏名:</label><input type="text" id="tName" placeholder="LE VAN C"></div>
            <div class="form-group"><label>受入企業:</label><input type="text" id="tCompany" placeholder="株式会社関西建設"></div>
            <div class="form-group">
              <label>在留資格:</label>
              <select id="tVisa"><option>技能実習1号</option><option>特定技能1号</option></select>
            </div>
            <div class="form-group"><label>入国日:</label><input type="date" id="tDate"></div>
          </div>
          <button class="btn btn-success" onclick="addTrainee()">+ 登録 (Thêm vào hệ thống)</button>
        </div>

        <div class="data-card">
          <div class="data-card-header"><div class="data-card-title">実習生一覧 (Danh sách TTS)</div></div>
          <table id="traineeTable">
            <thead>
              <tr><th>ID</th><th>氏名</th><th>受入企業</th><th>在留資格</th><th>入国日</th></tr>
            </thead>
            <tbody>
              <tr><td>TTS001</td><td>NGUYEN VAN A</td><td>株式会社大阪工業</td><td>技能実習1号</td><td>2024/05/10</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div id="companies" class="page-section">
        <div class="data-card">
          <div class="data-card-header"><div class="data-card-title">受入企業一覧 (Danh sách Xí nghiệp)</div></div>
          <table>
            <thead><tr><th>企業名</th><th>代表者</th><th>住所</th><th>人数</th></tr></thead>
            <tbody>
              <tr><td>株式会社大阪工業</td><td>山田 太郎</td><td>大阪府豊中市...</td><td>12名</td></tr>
              <tr><td>トヨタ金属株式会社</td><td>佐藤 健</td><td>愛知県名古屋市...</td><td>25名</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div id="documents" class="page-section">
        <div class="data-card">
          <div class="data-card-header"><div class="data-card-title">書類作成 (Tạo Giấy tờ OTIT)</div></div>
          <div class="form-grid">
            <div class="form-group">
              <label>対象企業:</label>
              <select><option>株式会社大阪工業</option><option>トヨタ金属株式会社</option></select>
            </div>
            <div class="form-group">
              <label>書類種別:</label>
              <select>
                <option>実習実施者 監査報告書</option>
                <option>訪問指導記録書</option>
              </select>
            </div>
          </div>
          <button class="btn btn-primary" onclick="alert('Đang tạo báo cáo...')">📄 書類を作成・印刷</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    function switchPage(pageId, element) {
      document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-menu li').forEach(n => n.classList.remove('active'));
      document.getElementById(pageId).classList.add('active');
      element.classList.add('active');
      document.getElementById('pageTitle').innerText = element.innerText;
    }

    function addTrainee() {
      const name = document.getElementById('tName').value;
      const comp = document.getElementById('tCompany').value;
      const visa = document.getElementById('tVisa').value;
      const date = document.getElementById('tDate').value;
      if(!name || !comp) { alert('Vui lòng nhập Họ tên và Xí nghiệp!'); return; }
      
      const table = document.getElementById('traineeTable').getElementsByTagName('tbody')[0];
      const newRow = table.insertRow();
      newRow.innerHTML = '<td>TTS002</td><td>' + name + '</td><td>' + comp + '</td><td>' + visa + '</td><td>' + (date || '未設定') + '</td>';
      alert('Đã thêm thành công!');
      document.getElementById('tName').value = '';
      document.getElementById('tCompany').value = '';
    }
  </script>
</body>
</html>
  `);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
