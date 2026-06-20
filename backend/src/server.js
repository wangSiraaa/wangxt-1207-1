const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

try {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2];
      }
    });
  }
} catch (e) {
  // ignore env load errors
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.use('/api/categories', require('./routes/categories'));
app.use('/api/cabinets', require('./routes/cabinets'));
app.use('/api/declarations', require('./routes/declarations'));
app.use('/api/transfers', require('./routes/transfers'));

app.use((req, res) => {
  res.status(404).json({ error: '接口不存在: ' + req.originalUrl });
});

app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

const PORT = process.env.API_PORT || 19507;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[waste-backend] API listening on http://0.0.0.0:${PORT}`);
});
