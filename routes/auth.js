const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { users } = require('../db');

const router = express.Router();

// 総当たり攻撃対策：ログイン・初回セットアップは15分間に10回までに制限する
// （IPごと。成功したリクエストもカウントに含める＝単純だが十分な抑止力になる）。
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'ログイン試行回数が多すぎます。しばらく時間をおいてから再度お試しください。' },
});

function publicUser(user) {
  return { id: user.id, username: user.username, name: user.name };
}

router.get('/setup-needed', async (req, res) => {
  const count = await users.count();
  res.json({ needed: count === 0 });
});

// 初回のみ：管理者アカウントを作成する（ユーザーが1件も無い場合だけ有効）
router.post('/setup', loginLimiter, async (req, res) => {
  const count = await users.count();
  if (count > 0) {
    return res.status(403).json({ error: 'セットアップは既に完了しています。' });
  }

  const { username, password, name } = req.body;
  const errors = [];
  if (!username || username.trim().length < 3) errors.push('ユーザー名は3文字以上で入力してください。');
  if (!password || password.length < 6) errors.push('パスワードは6文字以上で入力してください。');
  if (errors.length) return res.status(400).json({ errors });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await users.insert({
    username: username.trim(),
    passwordHash,
    name: (name || '').trim(),
    createdAt: new Date().toISOString(),
  });

  req.session.userId = user.id;
  res.status(201).json(publicUser(user));
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ errors: ['ユーザー名とパスワードを入力してください。'] });
  }

  const user = await users.findByUsername(username.trim());
  if (!user) {
    return res.status(401).json({ error: 'ユーザー名またはパスワードが正しくありません。' });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ error: 'ユーザー名またはパスワードが正しくありません。' });
  }

  req.session.userId = user.id;
  res.json(publicUser(user));
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: '認証が必要です。' });
  }
  const user = await users.get(req.session.userId);
  if (!user) return res.status(401).json({ error: '認証が必要です。' });
  res.json(publicUser(user));
});

// ログイン済みユーザーのみ、新しいスタッフアカウントを追加できる
router.post('/register', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: '認証が必要です。' });
  }

  const { username, password, name } = req.body;
  const errors = [];
  if (!username || username.trim().length < 3) errors.push('ユーザー名は3文字以上で入力してください。');
  if (!password || password.length < 6) errors.push('パスワードは6文字以上で入力してください。');
  if (errors.length) return res.status(400).json({ errors });

  const existing = await users.findByUsername(username.trim());
  if (existing) return res.status(400).json({ errors: ['このユーザー名は既に使用されています。'] });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await users.insert({
    username: username.trim(),
    passwordHash,
    name: (name || '').trim(),
    createdAt: new Date().toISOString(),
  });

  res.status(201).json(publicUser(user));
});

module.exports = router;
