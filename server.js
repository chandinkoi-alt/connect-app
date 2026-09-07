const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Cấu hình Middleware
app.use(cors());
app.use(express.json());

// Nếu có thư mục giao diện HTML/CSS/JS tĩnh (thư mục public)
app.use(express.static(path.join(__dirname, 'public')));

// Trả về thông tin cơ bản của Tổ chức
app.get('/api/info', (req, res) => {
  res.json({
    unionName: process.env.UNION_NAME || 'コネクト協同組合',
    permitNo: process.env.PERMIT_NO || '許1808000401',
    status: 'Active'
  });
});

// Route kiểm tra sức khỏe hệ thống
app.get('/health', (req, res) => {
  res.send('OK');
});

// Trang mặc định nếu không có giao diện public
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>${process.env.UNION_NAME || 'コネクト協同組合'}</title>
        <meta charset="utf-8">
      </head>
      <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
        <h1>${process.env.UNION_NAME || 'コネクト協同組合'}</h1>
        <p>許可番号: ${process.env.PERMIT_NO || '許1808000401'}</p>
        <p style="color: green; font-weight: bold;">System is running smoothly on Render!</p>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});