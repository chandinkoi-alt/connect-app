const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const { ready } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
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

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

ready
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
