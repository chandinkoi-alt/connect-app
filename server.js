const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const { ready } = require('./db');
const { buildBackupPayload, backupFilename } = require('./lib/backupData');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.disable('x-powered-by');
// 画面がインラインscriptで構成されているページがあるため、CSPのみ無効化して
// クリックジャッキング対策・MIMEスニッフィング対策等の基本的なセキュリティ
// ヘッダーだけを付与する。
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30日
    },
  })
);

app.get('/health', (req, res) => res.send('OK'));

app.use('/api/auth', require('./routes/auth'));

// 週次の自動バックアップ用（Google Driveへの定期アップロードなど、外部の
// スケジューラから叩く想定）。ログインセッションではなく、環境変数BACKUP_TOKEN
// と一致する秘密トークンで認証する。BACKUP_TOKEN未設定の場合は常に401とし、
// 誤って無認証で全データが取得できる状態にならないようにする。
function safeTokenEquals(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

app.get('/api/admin/import/backup-auto', async (req, res) => {
  if (!process.env.BACKUP_TOKEN || !safeTokenEquals(req.query.token, process.env.BACKUP_TOKEN)) {
    return res.status(401).json({ error: '認証が必要です。' });
  }
  try {
    const payload = await buildBackupPayload();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${backupFilename()}`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    res.status(500).json({ error: 'バックアップの作成に失敗しました: ' + err.message });
  }
});

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ error: '認証が必要です。' });
}

app.use('/api', requireAuth);

app.use('/api/sending-orgs', require('./routes/sendingOrgs'));
app.use('/api/host-companies', require('./routes/hostCompanies'));
app.use('/api/candidates', require('./routes/candidates'));
app.use('/api/workers', require('./routes/workers'));
app.use('/api/application-cases', require('./routes/applicationCases'));
app.use('/api/visits', require('./routes/visits'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/admin/import', require('./routes/adminImport'));

// index.html / login.html はブラウザやbfcacheにキャッシュさせない
// （ログアウト後に戻るボタンで古い認証済み画面が一瞬表示される問題を防ぐ）
// express.static は "/" を index.html として自動配信してしまうため、
// 先にこのルートで明示的に処理する（static はそれ以外の静的ファイル用）
function noStore(req, res, next) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
}

app.get('/', noStore, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login.html', noStore, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/admin-import.html', noStore, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-import.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

ready
  .then(() => {
    const usingTurso = !!process.env.TURSO_DATABASE_URL;
    console.log(
      usingTurso
        ? 'データベース: Turso（永続化・再起動しても消えません）'
        : '警告: データベース: ローカルファイル（TURSO_DATABASE_URL未設定。Render等では再起動・再デプロイのたびに全データが消えます）'
    );
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
