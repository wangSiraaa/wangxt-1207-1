const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT tr.*, d.lab_name, d.status
    FROM transfer_records tr
    JOIN declarations d ON d.id = tr.declaration_id
    ORDER BY tr.id DESC
  `).all();
  res.json(rows);
});

module.exports = router;
