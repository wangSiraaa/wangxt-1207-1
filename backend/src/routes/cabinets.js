const express = require('express');
const db = require('../db');
const { CLASS_LABELS } = require('../rules');
const router = express.Router();

const STORED_SQL = `
  SELECT d.id, d.barrel_code, cat.name AS category_name, cat.code AS category_code, cat.compat_class
  FROM declarations d
  JOIN categories cat ON cat.id = d.category_id
  WHERE d.cabinet_id = ? AND d.status = 'stored'
  ORDER BY d.id
`;

router.get('/', (req, res) => {
  const cabinets = db.prepare('SELECT * FROM cabinets ORDER BY id').all();
  const out = cabinets.map((c) => {
    const stored = db.prepare(STORED_SQL).all(c.id);
    const classes = [...new Set(stored.map((s) => s.compat_class))];
    const classLabels = {};
    classes.forEach((cls) => { classLabels[cls] = CLASS_LABELS[cls] || cls; });
    return {
      ...c,
      load: stored.length,
      remaining: c.capacity - stored.length,
      classes,
      class_labels: classLabels,
      stored,
    };
  });
  res.json(out);
});

module.exports = router;
