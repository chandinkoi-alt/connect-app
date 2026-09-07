const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Trả về thông tin API
app.get('/api/info', (req, res) => {
  res.json({
    unionName: process.env.UNION_NAME || 'コネクト協同組合',
    permitNo: process.env.PERMIT_NO || '許1808000401',
    status: 'Active'
  });
});

// Route kiểm tra sức khỏe
app.get('/health', (req, res) => {
  res.send('OK');
});

// GIAO DIỆN CHÍNH (Đưa trực tiếp HTML vào đây)
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>コネクト協同組合 - 管理システム</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"></script>
  <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f4f6f9;
      margin: 0;
      padding: 20px;
      color: #333;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 {
      color: #004085;
      border-bottom: 2px solid #004085;
      padding-bottom: 10px;
      margin-top: 0;
    }
    .info-card {
      background: #e9ecef;
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
    }
    .form-group {
      margin-bottom: 15px;
    }
    label {
      display: block;
      margin-bottom: 5px;
      font-weight: bold;
    }
    input[type="text"], input[type="date"] {
      width: 100%;
      padding: 10px;
      border: 1px solid #ced4da;
      border-radius: 4px;
      box-sizing: border-box;
    }
    button {
      background-color: #28a745;
      color: white;
      border: none;
      padding: 12px 20px;
      font-size: 16px;
      border-radius: 4px;
      cursor: pointer;
      width: 100%;
      font-weight: bold;
    }
    button:hover {
      background-color: #218838;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>コネクト協同組合</h1>
    
    <div class="info-card">
      <p><strong>許可番号:</strong> 許1808000401</p>
      <p><strong>ステータス:</strong> <span style="color: green; font-weight: bold;">システム稼働中 (System Online)</span></p>
    </div>

    <h2>データ出力 (Excel Export)</h2>
    
    <div class="form-group">
      <label for="memberName">氏名 (Họ và tên):</label>
      <input type="text" id="memberName" placeholder="例: 山田 太郎">
    </div>

    <div class="form-group">
      <label for="startDate">実習開始日 (Ngày bắt đầu):</label>
      <input type="date" id="startDate">
    </div>

    <button onclick="exportExcel()">Excelファイルをダウンロード (Xuất Excel)</button>
  </div>

  <script>
    async function exportExcel() {
      const name = document.getElementById('memberName').value || '未入力';
      const date = document.getElementById('startDate').value || '未設定';

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('組合員データ');

      worksheet.columns = [
        { header: '組合名 (Tên nghiệp đoàn)', key: 'union', width: 25 },
        { header: '許可番号 (Số giấy phép)', key: 'permit', width: 20 },
        { header: '氏名 (Họ tên)', key: 'name', width: 20 },
        { header: '実習開始日 (Ngày bắt đầu)', key: 'date', width: 15 }
      ];

      worksheet.addRow({
        union: 'コネクト協同組合',
        permit: '許1808000401',
        name: name,
        date: date
      });

      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '004085' }
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = \`Connect_Coop_\${Date.now()}.xlsx\`;
      link.click();
    }
  </script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
