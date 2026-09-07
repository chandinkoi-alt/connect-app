const express = require('express');
const cors = require('cors');
const path = require('path');
const { ready } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.send('OK'));

app.use('/api/sending-orgs', require('./routes/sendingOrgs'));
app.use('/api/host-companies', require('./routes/hostCompanies'));
app.use('/api/candidates', require('./routes/candidates'));
app.use('/api/workers', require('./routes/workers'));
app.use('/api/application-cases', require('./routes/applicationCases'));
app.use('/api/visits', require('./routes/visits'));
app.use('/api/dashboard', require('./routes/dashboard'));

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
