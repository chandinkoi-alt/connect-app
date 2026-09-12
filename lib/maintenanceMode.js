const crypto = require('crypto');

const COOKIE_NAME = 'maintenance_bypass';

function safeTokenEquals(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

const PAGE = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>システムメンテナンス中</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    font-family:-apple-system,'Hiragino Kaku Gothic ProN',Meiryo,sans-serif; background:#0f172a; color:#e2e8f0; }
  .box { max-width:420px; padding:32px; text-align:center; }
  h1 { font-size:20px; margin:16px 0 8px; }
  p { font-size:14px; line-height:1.7; color:#94a3b8; margin:4px 0; }
</style>
</head>
<body>
  <div class="box">
    <h1>ただいまメンテナンス中です</h1>
    <p>システムを一時的に停止しております。</p>
    <p>Hệ thống đang tạm ngưng để bảo trì. Vui lòng quay lại sau.</p>
  </div>
</body>
</html>`;

// 「一時的にアプリを閉じておきたい」ための簡易メンテナンスモード。
// MAINTENANCE_MODE=true の間、/health 以外の全リクエストにこのページを返す。
// MAINTENANCE_BYPASS_TOKEN を知っている人だけ ?bypass=<トークン> で一度アクセスすれば、
// 以後はブラウザにCookieが保存され、メンテナンス中でも通常通り使い続けられる。
function maintenanceGate(req, res, next) {
  if (process.env.MAINTENANCE_MODE !== 'true') return next();
  if (req.path === '/health') return next();

  const token = process.env.MAINTENANCE_BYPASS_TOKEN;
  const givenQuery = req.query && req.query.bypass;
  if (token && givenQuery && safeTokenEquals(givenQuery, token)) {
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return next();
  }
  if (token && safeTokenEquals(getCookie(req, COOKIE_NAME), token)) return next();

  res.status(503);
  res.setHeader('Retry-After', '3600');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(PAGE);
}

module.exports = { maintenanceGate };
