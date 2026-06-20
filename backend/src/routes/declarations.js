const express = require('express');
const db = require('../db');
const { compatibleWithAll, CLASS_LABELS, validateHazardProps, hazardList, calcDiff, DIFF_THRESHOLD_PERCENT } = require('../rules');
const { requireRole } = require('../auth');
const router = express.Router();

const STATUS_LABELS = {
  pending: '待暂存',
  stored: '已暂存',
  transferring: '转运中',
  weighed: '已称重',
  review_pending: '待复核',
};

const REVIEW_STATUS_LABELS = {
  pending: '待复核',
  approved: '复核通过',
  rejected: '复核驳回',
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

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function rowToDecl(r) {
  if (!r) return r;
  const hazards = hazardList(r.hazard_props);
  const dw = Number(r.declare_weight) || 0;
  const aw = Number(r.weight) || 0;
  const hasBoth = dw > 0 && aw > 0;
  const diff = hasBoth ? calcDiff(dw, aw) : null;
  return {
    id: r.id,
    barrel_code: r.barrel_code,
    category_id: r.category_id,
    category_code: r.category_code,
    category_name: r.category_name,
    compat_class: r.compat_class,
    compat_label: CLASS_LABELS[r.compat_class] || r.compat_class,
    hazard_props: r.hazard_props,
    hazard_list: hazards,
    hazard_codes: hazards.map((h) => h.code),
    lab_name: r.lab_name,
    submitter: r.submitter,
    status: r.status,
    status_label: STATUS_LABELS[r.status],
    cabinet_id: r.cabinet_id,
    cabinet_name: r.cabinet_name,
    declare_weight: dw,
    weight: aw,
    diff: diff ? {
      diff_weight: round2(diff.diff_weight),
      diff_percent: round2(diff.diff_percent),
      needs_review: diff.needs_review,
      threshold: DIFF_THRESHOLD_PERCENT,
    } : null,
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

function rowToReview(r) {
  if (!r) return r;
  return {
    id: r.id,
    declaration_id: r.declaration_id,
    barrel_code: r.barrel_code,
    declare_weight: Number(r.declare_weight) || 0,
    actual_weight: Number(r.actual_weight) || 0,
    diff_percent: round2(Number(r.diff_percent) || 0),
    diff_weight: round2(Number(r.diff_weight) || 0),
    status: r.status,
    status_label: REVIEW_STATUS_LABELS[r.status] || r.status,
    review_note: r.review_note,
    reviewer: r.reviewer,
    reviewed_at: r.reviewed_at,
    hazard_list: hazardList(r.hazard_props),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

router.get('/rules/hazards', (req, res) => {
  const { HAZARD_PROPS, INCOMPATIBLE_PAIRS, CLASS_LABELS, DIFF_THRESHOLD_PERCENT } = require('../rules');
  res.json({
    hazards: HAZARD_PROPS,
    incompatible_pairs: INCOMPATIBLE_PAIRS,
    class_labels: CLASS_LABELS,
    diff_threshold_percent: DIFF_THRESHOLD_PERCENT,
    threshold: DIFF_THRESHOLD_PERCENT,
  });
});

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
  const out = rowToDecl(row);
  const ro = db.prepare('SELECT * FROM review_orders WHERE declaration_id = ? ORDER BY id DESC').all(req.params.id);
  out.reviews = ro.map(rowToReview);
  res.json(out);
});

router.post('/', requireRole('lab', '新建废液申报'), (req, res) => {
  const body = req.body || {};
  const { barrel_code, category_id, category_code, lab_name, submitter, remark, hazard_props, declare_weight } = body;

  if (!barrel_code || !barrel_code.trim()) return res.status(400).json({ error: '请填写桶码' });

  const hz = validateHazardProps(hazard_props);
  if (!hz.ok) return res.status(400).json({ error: hz.msg });

  const dw = Number(declare_weight);
  if (!dw || isNaN(dw) || dw <= 0) {
    return res.status(400).json({ error: '请填写有效的申报重量(kg)' });
  }

  let cat = null;
  if (category_id) {
    cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(category_id);
  } else if (category_code) {
    cat = db.prepare('SELECT * FROM categories WHERE code = ?').get(category_code);
  }
  if (!cat) return res.status(400).json({ error: '废液类别不存在或未选择' });

  const dup = db.prepare('SELECT id FROM declarations WHERE barrel_code = ?').get(barrel_code.trim());
  if (dup) return res.status(400).json({ error: '桶码已存在，不能重复申报' });

  const ts = now();
  const info = db.prepare(`
    INSERT INTO declarations(
      barrel_code, category_id, lab_name, submitter, status,
      hazard_props, declare_weight, remark, created_at, updated_at
    ) VALUES(?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
  `).run(
    barrel_code.trim(),
    cat.id,
    (lab_name || '').trim() || null,
    (submitter || '').trim() || null,
    hz.list.join(','),
    dw,
    remark || null,
    ts, ts
  );
  const row = db.prepare(SELECT_DECL + ' WHERE d.id = ?').get(info.lastInsertRowid);
  res.status(201).json(rowToDecl(row));
});

router.patch('/:id', requireRole('lab', '修改申报信息'), (req, res) => {
  const row = db.prepare('SELECT * FROM declarations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '申报单不存在' });

  if (row.status === 'weighed' || row.status === 'review_pending') {
    return res.status(400).json({ error: '已称重/已进入复核流程，单据已锁定，桶码及信息不可修改' });
  }

  const { barrel_code, category_id, category_code, lab_name, submitter, remark, hazard_props, declare_weight } = req.body || {};

  let nextHazards = row.hazard_props;
  if (hazard_props !== undefined) {
    const hz = validateHazardProps(hazard_props);
    if (!hz.ok) return res.status(400).json({ error: hz.msg });
    nextHazards = hz.list.join(',');
  }

  let nextDeclareWeight = Number(row.declare_weight) || 0;
  if (declare_weight !== undefined && declare_weight !== null && declare_weight !== '') {
    const dw = Number(declare_weight);
    if (!dw || isNaN(dw) || dw <= 0) {
      return res.status(400).json({ error: '请填写有效的申报重量(kg)' });
    }
    nextDeclareWeight = dw;
  }

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
    SET barrel_code = ?, category_id = ?, lab_name = ?, submitter = ?, remark = ?,
        hazard_props = ?, declare_weight = ?, updated_at = ?
    WHERE id = ?
  `).run(
    barrel_code || row.barrel_code,
    nextCategoryId,
    lab_name ?? row.lab_name,
    submitter ?? row.submitter,
    remark ?? row.remark,
    nextHazards,
    nextDeclareWeight,
    now(),
    row.id
  );
  const updated = db.prepare(SELECT_DECL + ' WHERE d.id = ?').get(row.id);
  res.json(rowToDecl(updated));
});

router.delete('/:id', requireRole('lab', '删除申报单'), (req, res) => {
  const row = db.prepare('SELECT * FROM declarations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '申报单不存在' });
  if (row.status !== 'pending') {
    return res.status(400).json({ error: '已进入暂存/转运流程，不能删除' });
  }
  db.prepare('DELETE FROM declarations WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

router.post('/:id/store', requireRole('officer', '暂存入库确认'), (req, res) => {
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

router.post('/:id/unstore', requireRole('officer', '取消暂存'), (req, res) => {
  const row = db.prepare('SELECT * FROM declarations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '申报单不存在' });
  if (row.status !== 'stored') return res.status(400).json({ error: '仅已暂存状态可取消暂存' });
  db.prepare("UPDATE declarations SET cabinet_id = NULL, status = 'pending', updated_at = ? WHERE id = ?")
    .run(now(), row.id);
  const updated = db.prepare(SELECT_DECL + ' WHERE d.id = ?').get(row.id);
  res.json(rowToDecl(updated));
});

router.post('/:id/transfer', requireRole('disposal', '登记转运'), (req, res) => {
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
    INSERT INTO transfer_records(declaration_id, barrel_code, category_name, transfer_unit, operator, vehicle, transferred_at, declare_weight)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.barrel_code, row.category_name, transfer_unit, operator, vehicle || null, ts, Number(row.declare_weight) || 0);

  const updated = db.prepare(SELECT_DECL + ' WHERE d.id = ?').get(row.id);
  res.json(rowToDecl(updated));
});

router.post('/:id/weigh', requireRole('disposal', '处置称重确认'), (req, res) => {
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
  const dw = Number(row.declare_weight) || 0;
  const diff = calcDiff(dw, w);

  let tx;
  try {
    db.exec('BEGIN');
    if (diff.needs_review) {
      db.prepare(`
        UPDATE declarations SET status = 'review_pending', weight = ?, weighed_at = ?, locked = 1, updated_at = ? WHERE id = ?
      `).run(w, ts, ts, row.id);

      db.prepare(`
        UPDATE transfer_records SET weight = ?, weighed_at = ?, declare_weight = ?, diff_percent = ? WHERE declaration_id = ?
      `).run(w, ts, dw, round2(diff.diff_percent), row.id);

      const ro = db.prepare(`
        INSERT INTO review_orders(
          declaration_id, barrel_code, declare_weight, actual_weight,
          diff_percent, diff_weight, status, hazard_props, created_at, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
      `).run(
        row.id,
        row.barrel_code,
        dw, w,
        round2(diff.diff_percent),
        round2(diff.diff_weight),
        row.hazard_props,
        ts, ts
      );

      tx = { needs_review: true, review_id: ro.lastInsertRowid };
    } else {
      db.prepare(`
        UPDATE declarations SET status = 'weighed', weight = ?, weighed_at = ?, locked = 1, updated_at = ? WHERE id = ?
      `).run(w, ts, ts, row.id);

      db.prepare(`
        UPDATE transfer_records SET weight = ?, weighed_at = ?, declare_weight = ?, diff_percent = ? WHERE declaration_id = ?
      `).run(w, ts, dw, round2(diff.diff_percent), row.id);

      tx = { needs_review: false };
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  const updated = db.prepare(SELECT_DECL + ' WHERE d.id = ?').get(row.id);
  const out = rowToDecl(updated);
  if (tx.needs_review) {
    out.review_created = true;
    out.review_id = tx.review_id;
    out.message = `称重与申报重量差异超过${round2(diff.diff_percent)}%，已自动生成复核单，请安全员复核`;
  }
  res.json(out);
});

/* ========== 复核单接口 ========== */

router.get('/reviews/list', (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT * FROM review_orders';
  const params = [];
  if (status) {
    sql += ' WHERE status = ?';
    params.push(status);
  }
  sql += ' ORDER BY id DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(rowToReview));
});

router.get('/reviews/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM review_orders WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '复核单不存在' });
  const decl = db.prepare(SELECT_DECL + ' WHERE d.id = ?').get(row.declaration_id);
  const out = rowToReview(row);
  out.declaration = decl ? rowToDecl(decl) : null;
  res.json(out);
});

router.post('/reviews/:id/approve', requireRole(['officer', 'disposal'], '复核通过'), (req, res) => {
  const { review_note, reviewer } = req.body || {};
  const row = db.prepare('SELECT * FROM review_orders WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '复核单不存在' });
  if (row.status !== 'pending') {
    return res.status(400).json({ error: '该复核单已处理' });
  }
  const ts = now();
  db.prepare(`
    UPDATE review_orders
    SET status = 'approved', review_note = ?, reviewer = ?, reviewed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(review_note || null, reviewer || null, ts, ts, row.id);

  db.prepare(`
    UPDATE declarations SET status = 'weighed', updated_at = ? WHERE id = ?
  `).run(ts, row.declaration_id);

  const updated = db.prepare('SELECT * FROM review_orders WHERE id = ?').get(row.id);
  res.json(rowToReview(updated));
});

router.post('/reviews/:id/reject', requireRole(['officer', 'disposal'], '复核驳回'), (req, res) => {
  const { review_note, reviewer } = req.body || {};
  const row = db.prepare('SELECT * FROM review_orders WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '复核单不存在' });
  if (row.status !== 'pending') {
    return res.status(400).json({ error: '该复核单已处理' });
  }
  if (!review_note || !review_note.trim()) {
    return res.status(400).json({ error: '驳回需填写复核说明' });
  }
  const ts = now();
  db.prepare(`
    UPDATE review_orders
    SET status = 'rejected', review_note = ?, reviewer = ?, reviewed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(review_note.trim(), reviewer || null, ts, ts, row.id);

  db.prepare(`
    UPDATE declarations SET status = 'transferring', locked = 0, weight = NULL, weighed_at = NULL, updated_at = ? WHERE id = ?
  `).run(ts, row.declaration_id);

  db.prepare(`
    UPDATE transfer_records SET weight = NULL, weighed_at = NULL, diff_percent = NULL WHERE declaration_id = ?
  `).run(row.declaration_id);

  const updated = db.prepare('SELECT * FROM review_orders WHERE id = ?').get(row.id);
  res.json(rowToReview(updated));
});

module.exports = router;
