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
  <title>コネクト協同組合 - OTIT申請書類作成</title>
  <!-- Nhúng thư viện SheetJS để xuất Excel trực tiếp trên Trình duyệt -->
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: "Hiragino Sans", "Meiryo", Arial, sans-serif; }
    body { background-color: #f8fafc; color: #0f172a; }
    header { background-color: #ffffff; color: #0f172a; border-bottom: 2px solid #0284c7; padding: 12px 30px; display: flex; justify-content: space-between; align-items: center; }
    .brand { font-weight: bold; font-size: 20px; color: #0284c7; }
    .sub-info { border-left: 1px solid #cbd5e1; padding-left: 15px; font-size: 12px; color: #64748b; }
    main { padding: 25px 30px; max-width: 1200px; margin: 0 auto; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; }
    .card { background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; }
    .card-title { margin-top: 0; color: #0f172a; font-size: 16px; margin-bottom: 15px; font-weight: bold; }
    .form-group { margin-bottom: 12px; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
    label { display: block; font-weight: bold; font-size: 12px; margin-bottom: 4px; color: #334155; }
    input, select { width: 100%; padding: 8px 10px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 13px; }
    .btn { width: 100%; padding: 12px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px; }
    .btn-primary { background-color: #0284c7; color: #fff; }
    .btn-success { background-color: #166534; color: #fff; margin-top: 15px; }
    .alert-error { padding: 15px; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; color: #991b1b; font-size: 13px; }
    .alert-success { padding: 12px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; color: #166534; font-size: 13px; margin-bottom: 15px; }
    .doc-list { border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-bottom: 15px; }
    .doc-item { padding: 10px 15px; border-bottom: 1px solid #f1f5f9; font-size: 13px; display: flex; justify-content: space-between; align-items: center; }
    .badge { background-color: #dcfce7; color: #15803d; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
  </style>
</head>
<body>

  <header>
    <div style="display: flex; align-items: center; gap: 15px;">
      <div class="brand">CONNECT 協同組合</div>
      <div class="sub-info">
        許可番号: 許1808000401 | 大阪府豊中市服部元町 1-9-20 ユミヤビル 3階
      </div>
    </div>
  </header>

  <main>
    <div class="grid">
      <!-- INPUT FORM -->
      <div class="card">
        <div class="card-title">📝 認定申請 書類作成データ入力</div>
        <form id="otitForm" onsubmit="handleValidate(event)">
          <div class="form-group">
            <label>実習実施者（受入企業）:</label>
            <select id="selectedCompanyId">
              <option value="1">株式会社 田中鉄工 (機械加工 (普通旋盤作業))</option>
              <option value="2">ヤマト食品 株式会社 (惣菜加工 (惣菜加工加工品作業))</option>
            </select>
          </div>

          <div class="form-group">
            <label>技能実習生氏名 (ローマ字):</label>
            <input type="text" id="workerName" value="NGUYEN VAN A" required>
          </div>

          <div class="form-row">
            <div>
              <label>生年月日:</label>
              <input type="date" id="workerDob" value="2000-01-15" required>
            </div>
            <div>
              <label>性別:</label>
              <select id="gender">
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>旅券番号 (Passport):</label>
            <input type="text" id="passport" value="C12345678" required>
          </div>

          <div class="form-row">
            <div>
              <label>技能実習指導員 氏名:</label>
              <input type="text" id="instructorName" value="佐藤 健二" required>
            </div>
            <div>
              <label>指導員 経験年数:</label>
              <input type="number" id="instructorExp" value="8" required>
            </div>
          </div>

          <div class="form-group">
            <label>基本賃金 (時給換算・円):</label>
            <input type="number" id="hourlyWage" value="1120" required>
          </div>

          <button type="submit" class="btn btn-primary">🔍 法令チェック＆書類生成</button>
        </form>
      </div>

      <!-- OUTPUT AREA -->
      <div class="card">
        <div class="card-title">📄 OTIT 提出用書類一覧 (自動生成)</div>
        <div id="outputContent">
          <div style="text-align: center; padding: 40px 20px; color: #94a3b8; border: 2px dashed #cbd5e1; border-radius: 8px;">
            <p>左側のフォームに入力し、書類生成ボタンを押してください。</p>
          </div>
        </div>
      </div>
    </div>
  </main>

  <script>
    const unionInfo = {
      name: 'コネクト協同組合',
      postalCode: '〒561-0851',
      address: '大阪府豊中市服部元町 1-9-20 ユミヤビル 3階',
      kanriNumber: '許1808000401'
    };

    const companies = [
      { id: 1, nameKanji: '株式会社 田中鉄工', address: '大阪府大阪市淀川区1-2-3', representative: '田中 太郎', employeeCount: 28, currentTts: 2, jobCategory: '機械加工 (普通旋盤作業)' },
      { id: 2, nameKanji: 'ヤマト食品 株式会社', address: '兵庫県神戸市中央区4-5-6', representative: '山本 一郎', employeeCount: 45, currentTts: 4, jobCategory: '惣菜加工 (惣菜加工加工品作業)' }
    ];

    let currentCompany = null;

    function handleValidate(e) {
      e.preventDefault();
      const compId = Number(document.getElementById('selectedCompanyId').value);
      currentCompany = companies.find(c => c.id === compId);
      
      const instructorExp = Number(document.getElementById('instructorExp').value);
      const hourlyWage = Number(document.getElementById('hourlyWage').value);
      const instructorName = document.getElementById('instructorName').value;

      let errors = [];
      let maxQuota = currentCompany.employeeCount <= 30 ? 3 : currentCompany.employeeCount <= 40 ? 4 : 5;

      if (currentCompany.currentTts >= maxQuota) {
        errors.push(\`【受入枠超過】\${currentCompany.nameKanji} は年間受入枠（\${maxQuota}名）の上限に達しています。\`);
      }
      if (instructorExp < 5) {
        errors.push(\`【指導員要件不備】技能実習指導員（\${instructorName}）の実務経験が5年未満です（現在: \${instructorExp}年）。\`);
      }
      if (hourlyWage < 1064) {
        errors.push(\`【賃金違反】基本賃金（\${hourlyWage}円）が大阪府最低賃金（1,064円）を下回っています。\`);
      }

      const outputDiv = document.getElementById('outputContent');

      if (errors.length > 0) {
        let errHtml = '<div class="alert-error"><h4 style="color:#dc2626; margin-bottom:8px;">✕ 申請不備（OTIT不適合）:</h4><ul style="padding-left:20px;">';
        errors.forEach(err => { errHtml += \`<li>\${err}</li>\`; });
        errHtml += '</ul></div>';
        outputDiv.innerHTML = errHtml;
      } else {
        outputDiv.innerHTML = \`
          <div class="alert-success">✓ OTIT審査基準の適合を確認しました。全申請書類の出力が可能です。</div>
          <div class="doc-list">
            <div class="doc-item">📄 技能実習計画認定申請書 (様式第1-1号) <span class="badge">Auto-filled</span></div>
            <div class="doc-item">📄 技能実習生の名簿 <span class="badge">Auto-filled</span></div>
            <div class="doc-item">📄 役員の同意書・誓約書 <span class="badge">Auto-filled</span></div>
            <div class="doc-item">📄 雇用条件書・賃金控除協定書 <span class="badge">Auto-filled</span></div>
          </div>
          <button onclick="generateOtitExcelDocs()" class="btn btn-success">📥 OTIT提出用 Excel ファイルを出力 (.XLSX)</button>
        \`;
      }
    }

    function generateOtitExcelDocs() {
      const workerName = document.getElementById('workerName').value;
      const workerDob = document.getElementById('workerDob').value;
      const gender = document.getElementById('gender').value;
      const passport = document.getElementById('passport').value;
      const instructorName = document.getElementById('instructorName').value;
      const instructorExp = document.getElementById('instructorExp').value;
      const hourlyWage = document.getElementById('hourlyWage').value;

      const wb = XLSX.utils.book_new();

      const sheet1Data = [
        ["技能実習計画認定申請書 (様式第1-1号)"],
        ["外国人技能実習機構 理事長 殿"],
        ["申請年月日", new Date().toISOString().split('T')[0]],
        [""],
        ["【監理団体の情報】"],
        ["監理団体の名称", unionInfo.name],
        ["許可番号", unionInfo.kanriNumber],
        ["所在地", \`\${unionInfo.postalCode} \${unionInfo.address}\`],
        [""],
        ["【実習実施者（受入企業）の情報】"],
        ["実習実施者名", currentCompany.nameKanji],
        ["代表者氏名", currentCompany.representative],
        ["所在地", currentCompany.address],
        ["常勤職員数", \`\${currentCompany.employeeCount} 名\`],
        ["移行対象職種・作業", currentCompany.jobCategory],
        [""],
        ["【技能実習指導員・条件】"],
        ["指導員氏名", instructorName],
        ["指導員経験年数", \`\${instructorExp} 年\`],
        ["基本基本賃金（時給換算）", \`\${hourlyWage} 円/時間\`]
      ];

      const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
      XLSX.utils.book_append_sheet(wb, ws1, "様式第1-1号");

      const sheet2Data = [
        ["技能実習生の名簿"],
        ["氏名（アルファベット）", "生年月日", "性別", "国籍", "パスポート番号", "受入企業"],
        [workerName, workerDob, gender, "ベトナム", passport, currentCompany.nameKanji]
      ];

      const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
      XLSX.utils.book_append_sheet(wb, ws2, "実習生名簿");

      XLSX.writeFile(wb, \`OTIT_認定申請書_\${currentCompany.nameKanji}_\${workerName}.xlsx\`);
    }
  </script>
</body>
</html>
  `);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
