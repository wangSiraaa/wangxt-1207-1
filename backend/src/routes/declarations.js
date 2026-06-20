const express = require('express');
const db = require('../db');
const { compatibleWithAll, CLASS_LABELS } = require('../rules');
const router = express.Router();

const STATUS_LABELS = {
  pending: '待暂存',
  stored: '已暂存',
  transferring: '转运中',
  weighed: '已称重',
};

const SELECT_DECL = `
  SELECT d.*, cat.code AS category_code, cat.name AS category_name, cat.compat_class,
         cab.name AS cabinet_name
  FROM declarations d
  JOIN categories cat ON cat.id = d.category_id
  LEFT JOIN cabinets cab ON cab.id = d.cabinet_id
`;

function now() {
  return new Date().toISOString();
}

function rowToDecl(r) {
  if (!r) return r;
  return {
    id: r.id,
    barrel_code: r.barrel_code,
    category_id: r.category_id,
    category_code: r.category_code,
    category_name: r.category_name,
    compat_class: r.compat_class,
    compat_label: CLASS_LABELS[r.compat_class] || r.compat_class,
    lab_name: r.lab_name,
    submitter: r.submitter,
    status: r.status,
    status_label: STATUS_LABELS[r.status],
    cabinet_id: r.cabinet_id,
    cabinet_name: r.cabinet_name,
    weight: r.weight,
    transfer_unit: r.transfer_unit,
    transfer_operator: r.transfer_operator,
    transfer_vehicle: r.transfer_vehicle,
    transferred_at: r.transferred_at,
    weighed_at: r.weighed_at,
    locked: !!r.locked,
    remark: r.remark,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

router.get('/', (req, res) => {
  const { status } = req.query;
  let sql = SELECT_DECL;
  const params = [];
  if (status) {
    sql += ' WHERE d.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY d.id DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(rowToDecl));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(SELECT_DECL + ' WHERE d.id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '申报单不存在' });
  res.json(rowToDecl(row));
});

router.post('/', (req, res) => {
  const { barrel_code, category_id, category_code, lab_name, submitter, remark } = req.body || {};
  if (!barrel_code) return res.status(400).json({ error: '请填写桶码' });
  let cat = null;
  if (category_id) {
    cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(category_id);
  } else if (category_code) {
    cat = db.prepare('SELECT * FROM categories WHERE code = ?').get(category_code);
  }
  if (!cat) return res.status(400).json({ error: '废液类别不存在或未选择' });
  const dup = db.prepare('SELECT id FROM declarations WHERE barrel_code = ?').get(barrel_code);
  if (dup) return res.status(400).json({ error: '桶码已存在，不能重复申报' });

  const ts = now();
  const info = db.prepare(`
    INSERT INTO declarations(barrel_code, category_id, lab_name, submitter, status, remark, created_at, updated_at)
    VALUES(?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(barrel_code, cat.id, lab_name || null, submitter || null, remark || null, ts, ts);
  const row = db.prepare(SELECT_DECL + ' WHERE d.id = ?').get(info.lastInsertRowid);
  res.status(201).json(rowToDecl(row));
});

router.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM declarations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '申报单不存在' });

  if (row.status === 'weighed') {
    return res.status(400).json({ error: '已称重确认，单据已锁定，桶码及信息不可修改' });
  }

  const { barrel_code, category_id, category_code, lab_name, submitter, remark } = req.body || {};

  if (barrel_code && barrel_code !== row.barrel_code) {
    const dup = db.prepare('SELECT id FROM declarations WHERE barrel_code = ? AND id <> ?').get(barrel_code, row.id);
    if (dup) return res.status(400).json({ error: '桶码已存在' });
  }

  let nextCategoryId = row.category_id;
  let wantCatId = category_id || null;
  if (!wantCatId && category_code) {
    const byCode = db.prepare('SELECT id FROM categories WHERE code = ?').get(category_code);
    wantCatId = byCode ? byCode.id : null;
  }
  if (wantCatId && wantCatId !== row.category_id) {
    if (row.status !== 'pending') {
      return res.status(400).json({ error: '已进入暂存流程，不能变更废液类别（涉及柜内相容性）' });
    }
    const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(wantCatId);
    if (!cat) return res.status(400).json({ error: '废液类别不存在' });
    nextCategoryId = wantCatId;
  }

  db.prepare(`
    UPDATE declarations
    SET barrel_code = ?, category_id = ?, lab_name = ?, submitter = ?, remark = ?, updated_at = ?
    WHERE id = ?
  `).run(
    barrel_code || row.barrel_code,
    nextCategoryId,
    lab_name ?? row.lab_name,
    submitter ?? row.submitter,
    remark ?? row.remark,
    now(),
    row.id
  );
  const updated = db.prepare(SELECT_DECL + ' WHERE d.id = ?').get(row.id);
  res.json(rowToDecl(updated));
});

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM declarations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '申报单不存在' });
  if (row.status !== 'pending') {
    return res.status(400).json({ error: '已进入暂存/转运流程，不能删除' });
  }
  db.prepare('DELETE FROM declarations WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

router.post('/:id/store', (req, res) => {
  const { cabinet_id } = req.body || {};
  if (!cabinet_id) return res.status(400).json({ error: '请选择暂存柜' });
  const row = db.prepare(SELECT_DECL + ' WHERE d.id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '申报单不存在' });
  if (row.status !== 'pending') return res.status(400).json({ error: '当前状态不能暂存' });

  const cab = db.prepare('SELECT * FROM cabinets WHERE id = ?').get(cabinet_id);
  if (!cab) return res.status(400).json({ error: '暂存柜不存在' });

  const loadRow = db.prepare(
    "SELECT COUNT(*) AS c FROM declarations WHERE cabinet_id = ? AND status = 'stored'"
  ).get(cabinet_id);
  if (loadRow.c >= cab.capacity) {
    return res.status(400).json({
      error: `暂存柜「${cab.name}」已达容量上限（${cab.capacity}桶），不能提交`,
    });
  }

  const existing = db.prepare(`
    SELECT cat.compat_class FROM declarations d
    JOIN categories cat ON cat.id = d.category_id
    WHERE d.cabinet_id = ? AND d.status = 'stored'
  `).all(cabinet_id).map((r) => r.compat_class);
  const check = compatibleWithAll(row.compat_class, existing);
  if (!check.ok) {
    return res.status(400).json({
      error: `相容性冲突：本桶为「${CLASS_LABELS[row.compat_class] || row.compat_class}」类，与柜内已存「${CLASS_LABELS[check.conflict] || check.conflict}」类不相容，不能同柜暂存`,
    });
  }

  db.prepare("UPDATE declarations SET cabinet_id = ?, status = 'stored', updated_at = ? WHERE id = ?")
    .run(cabinet_id, now(), row.id);
  const updated = db.prepare(SELECT_DECL + ' WHERE d.id = ?').get(row.id);
  res.json(rowToDecl(updated));
});

router.post('/:id/unstore', (req, res) => {
  const row = db.prepare('SELECT * FROM declarations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '申报单不存在' });
  if (row.status !== 'stored') return res.status(400).json({ error: '仅已暂存状态可取消暂存' });
  db.prepare("UPDATE declarations SET cabinet_id = NULL, status = 'pending', updated_at = ? WHERE id = ?")
    .run(now(), row.id);
  const updated = db.prepare(SELECT_DECL + ' WHERE d.id = ?').get(row.id);
  res.json(rowToDecl(updated));
});

router.post('/:id/transfer', (req, res) => {
  const { transfer_unit, operator, vehicle } = req.body || {};
  if (!transfer_unit || !operator) {
    return res.status(400).json({ error: '处置单位、操作人为必填' });
  }
  const row = db.prepare(SELECT_DECL + ' WHERE d.id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '申报单不存在' });
  if (row.status !== 'stored') return res.status(400).json({ error: '仅已暂存状态可登记转运' });

  const ts = now();
  db.prepare(`
    UPDATE declarations
    SET status = 'transferring', transfer_unit = ?, transfer_operator = ?, transfer_vehicle = ?, transferred_at = ?, updated_at = ?
    WHERE id = ?
  `).run(transfer_unit, operator, vehicle || null, ts, ts, row.id);

  db.prepare(`
    INSERT INTO transfer_records(declaration_id, barrel_code, category_name, transfer_unit, operator, vehicle, transferred_at)
    VALUES(?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.barrel_code, row.category_name, transfer_unit, operator, vehicle || null, ts);

  const updated = db.prepare(SELECT_DECL + ' WHERE d.id = ?').get(row.id);
  res.json(rowToDecl(updated));
});

router.post('/:id/weigh', (req, res) => {
  const { weight } = req.body || {};
  if (weight === undefined || weight === null || Number(weight) < 0 || Number.isNaN(Number(weight))) {
    return res.status(400).json({ error: '请填写有效称重(kg)' });
  }
  const row = db.prepare(SELECT_DECL + ' WHERE d.id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '申报单不存在' });
  if (row.status !== 'transferring') {
    return res.status(400).json({ error: '仅转运中状态可称重确认' });
  }

  const ts = now();
  const w = Number(weight);
  db.prepare(`
    UPDATE declarations SET status = 'weighed', weight = ?, weighed_at = ?, locked = 1, updated_at = ? WHERE id = ?
  `).run(w, ts, ts, row.id);

  db.prepare(`
    UPDATE transfer_records SET weight = ?, weighed_at = ? WHERE declaration_id = ?
  `).run(w, ts, row.id);

  const updated = db.prepare(SELECT_DECL + ' WHERE d.id = ?').get(row.id);
  res.json(rowToDecl(updated));
});

module.exports = router;
