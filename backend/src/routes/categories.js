const express = require('express');
const db = require('../db');
const { CLASS_LABELS } = require('../rules');
const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY id').all();
  res.json(rows.map((r) => ({ ...r, compat_label: CLASS_LABELS[r.compat_class] || r.compat_class })));
});

module.exports = router;
