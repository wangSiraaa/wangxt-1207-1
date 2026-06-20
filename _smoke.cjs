const B = 'http://127.0.0.1:19507/api';
const log = [];
let pass = 0, fail = 0;
function check(name, cond, got) {
  if (cond) { pass++; log.push(`  ✅ ${name}`); }
  else { fail++; log.push(`  ❌ ${name}  got=${got}`); }
}
async function j(path, opts = {}) {
  const r = await fetch(B + path, opts);
  let body; try { body = await r.json(); } catch { body = await r.text(); }
  return { status: r.status, body };
}
async function post(path, data) {
  return j(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
async function patch(path, data) {
  return j(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
function hdr(role) {
  return { 'Content-Type': 'application/json', 'X-Role': role };
}
async function postR(path, data, role = 'lab') {
  return j(path, { method: 'POST', headers: hdr(role), body: JSON.stringify(data) });
}
async function patchR(path, data, role = 'lab') {
  return j(path, { method: 'PATCH', headers: hdr(role), body: JSON.stringify(data) });
}

(async () => {
  const h = await j('/health');
  check('health ok', h.status === 200 && h.body.ok === true, JSON.stringify(h.body));

  const rules = await j('/declarations/rules/hazards');
  check('rules endpoint returns hazards & threshold',
    rules.status === 200 && Array.isArray(rules.body.hazards) && rules.body.hazards.length > 0
      && typeof rules.body.threshold === 'number',
    JSON.stringify(rules.body));

  const cats = (await j('/categories')).body;
  check('categories have compat_label', !!cats[0].compat_label, JSON.stringify(cats[0]));
  const cabs = (await j('/cabinets')).body;
  const cabA = cabs.find(c => c.name === '暂存柜A');
  const cabB = cabs.find(c => c.name === '暂存柜B');
  const cabC = cabs.find(c => c.name === '暂存柜C');

  // --- NEW RULE 4: hazard_props 必填测试 ---
  const d_nohz = await postR('/declarations', {
    barrel_code: 'TEST-NO-HZ', category_code: 'acid',
    lab_name: '测试实验室', submitter: '测试员', declare_weight: 10.0,
    hazard_props: [],
  });
  check('RULE4: declare without hazard_props -> 400',
    d_nohz.status === 400, d_nohz.status + ' ' + JSON.stringify(d_nohz.body));

  // --- NEW RULE 5: declare_weight 必填测试 ---
  const d_now = await postR('/declarations', {
    barrel_code: 'TEST-NO-W', category_code: 'acid',
    lab_name: '测试实验室', submitter: '测试员',
    hazard_props: ['corrosive', 'toxic'],
  });
  check('RULE5: declare without declare_weight -> 400',
    d_now.status === 400, d_now.status + ' ' + JSON.stringify(d_now.body));

  // --- 正常申报（含 hazard_props + declare_weight） ---
  const d1 = await postR('/declarations', {
    barrel_code: 'T-ACID-001', category_code: 'acid',
    lab_name: '有机化学实验室', submitter: '张实验',
    declare_weight: 10.0, hazard_props: ['corrosive', 'toxic'],
  });
  check('declare ok with hazard + weight',
    d1.status === 201 && d1.body.hazard_codes?.length === 2 && d1.body.declare_weight === 10,
    d1.status + ' ' + JSON.stringify(d1.body));
  const id1 = d1.body.id;

  // 查看返回 hazard_list
  check('row hazard_list structured correctly',
    Array.isArray(d1.body.hazard_list) && d1.body.hazard_list.every(h => h.code && h.label),
    JSON.stringify(d1.body.hazard_list));

  // 暂存酸入柜A
  const s1 = await postR('/declarations/' + id1 + '/store', { cabinet_id: cabA.id }, 'officer');
  check('store acid in A ok', s1.status === 200, JSON.stringify(s1.body));

  // --- RULE 1: 酸碱不相容阻断 ---
  const d2 = await postR('/declarations', {
    barrel_code: 'T-BASE-001', category_code: 'base',
    lab_name: '无机化学实验室', submitter: '王实验',
    declare_weight: 8.0, hazard_props: ['corrosive', 'irritant'],
  });
  const s2 = await postR('/declarations/' + d2.body.id + '/store', { cabinet_id: cabA.id }, 'officer');
  check('RULE1: base into A (has acid) -> 400 incompatible',
    s2.status === 400, s2.status + ' ' + JSON.stringify(s2.body));
  const s2b = await postR('/declarations/' + d2.body.id + '/store', { cabinet_id: cabB.id }, 'officer');
  check('store base in B ok', s2b.status === 200, JSON.stringify(s2b.body));

  // 有机入柜A（与酸相容）
  const d3 = await postR('/declarations', {
    barrel_code: 'T-ORG-001', category_code: 'organic',
    lab_name: '有机化学实验室', submitter: '张实验',
    declare_weight: 15.0, hazard_props: ['flammable', 'toxic'],
  });
  const s3 = await postR('/declarations/' + d3.body.id + '/store', { cabinet_id: cabA.id }, 'officer');
  check('store organic in A (compat w/ acid) ok', s3.status === 200, JSON.stringify(s3.body));

  // --- RULE 2: 柜位超容量阻断 ---
  const f1 = await postR('/declarations', { barrel_code: 'T-ACID-002', category_code: 'acid', lab_name: '分析实验室', submitter: '刘实验', declare_weight: 5.0, hazard_props: ['corrosive'] });
  const f2 = await postR('/declarations', { barrel_code: 'T-ACID-003', category_code: 'acid', lab_name: '分析实验室', submitter: '刘实验', declare_weight: 5.5, hazard_props: ['corrosive'] });
  const f3 = await postR('/declarations', { barrel_code: 'T-ACID-004', category_code: 'acid', lab_name: '分析实验室', submitter: '刘实验', declare_weight: 6.0, hazard_props: ['corrosive'] });
  await postR('/declarations/' + f1.body.id + '/store', { cabinet_id: cabC.id }, 'officer');
  await postR('/declarations/' + f2.body.id + '/store', { cabinet_id: cabC.id }, 'officer');
  const capFail = await postR('/declarations/' + f3.body.id + '/store', { cabinet_id: cabC.id }, 'officer');
  check('RULE2: 3rd into full C (capacity=2) -> 400', capFail.status === 400, capFail.status + ' ' + JSON.stringify(capFail.body));

  // --- RULE 3: 称重后锁定，桶码不可改 ---
  const t1 = await postR('/declarations/' + id1 + '/transfer', { transfer_unit: '绿源环保', operator: '李处置', vehicle: '沪B·12345' }, 'disposal');
  check('transfer ok', t1.status === 200, JSON.stringify(t1.body));
  const w1 = await postR('/declarations/' + id1 + '/weigh', { weight: 10.3 }, 'disposal');
  check('weigh ok (within 20%): locked=true, status=weighed',
    w1.status === 200 && w1.body.locked === true && w1.body.status === 'weighed' && w1.body.weight === 10.3,
    JSON.stringify(w1.body));
  const patchFail = await patchR('/declarations/' + id1, { barrel_code: 'T-CHANGED-999' }, 'lab');
  check('RULE3: patch barrel after weigh -> 400 locked',
    patchFail.status === 400, patchFail.status + ' ' + JSON.stringify(patchFail.body));

  // --- NEW RULE 6: 差异>20% 自动生成复核单 ---
  // 把 d3（有机15kg）转运转运 -> 称重 25kg (差异 66.6%)
  const t3 = await postR('/declarations/' + d3.body.id + '/transfer',
    { transfer_unit: '绿源环保', operator: '李处置', vehicle: '沪B·67890' }, 'disposal');
  check('organic transfer ok', t3.status === 200, JSON.stringify(t3.body));
  const w3 = await postR('/declarations/' + d3.body.id + '/weigh',
    { weight: 25.0 }, 'disposal');
  check('RULE6: weigh diff 66.6% -> review_created + status=review_pending',
    w3.status === 200 && w3.body.review_created === true && w3.body.status === 'review_pending'
      && typeof w3.body.review_id === 'number',
    JSON.stringify(w3.body));
  const review_id = w3.body.review_id;

  // --- 复核单列表查询 ---
  const reviews = await j('/declarations/reviews/list');
  check('RULE6b: reviews list endpoint works, has pending',
    reviews.status === 200 && reviews.body.some(r => r.id === review_id && r.status === 'pending'),
    JSON.stringify(reviews.body.map(r => ({ id: r.id, status: r.status }))));

  // --- 复核单查询 ---
  const r0 = await j(`/declarations/reviews/${review_id}`);
  check('review get endpoint returns structured diff data',
    r0.status === 200 && r0.body.id === review_id && r0.body.diff_percent > 60
      && r0.body.hazard_list?.length === 2,
    JSON.stringify(r0.body));

  // --- 驳回复核单（解锁） ---
  const rej = await postR(`/declarations/reviews/${review_id}/reject`,
    { review_note: '实际重量申报错误，请实验室重新核实', reviewer: '学院安全员-王' }, 'officer');
  check('RULE6c: reject review -> ok',
    rej.status === 200, rej.status + ' ' + JSON.stringify(rej.body));
  const d3_after = (await j('/declarations')).body.find(dd => dd.id === d3.body.id);
  check('RULE6d: reject -> declaration status=transferring, locked=0',
    d3_after && d3_after.status === 'transferring' && !d3_after.locked,
    JSON.stringify(d3_after));

  // --- 重新称重（在 20% 内） ---
  const w3b = await postR('/declarations/' + d3.body.id + '/weigh',
    { weight: 16.0 }, 'disposal');
  check('RULE6e: re-weigh 16/15 diff 6.6% -> weighed, no review',
    w3b.status === 200 && w3b.body.status === 'weighed' && !w3b.body.review_created,
    JSON.stringify(w3b.body));

  // --- 再做一个：称重差异超限 -> 通过 ---
  // 先申请重金属废液（申报 20kg），入柜，转运，称重 26kg（30% 超限）
  const d4 = await postR('/declarations', {
    barrel_code: 'T-MET-001', category_code: 'metal',
    lab_name: '材料实验室', submitter: '陈实验',
    declare_weight: 20.0, hazard_props: ['toxic', 'carcinogen', 'environmental'],
  });
  await postR('/declarations/' + d4.body.id + '/store', { cabinet_id: cabB.id }, 'officer');
  await postR('/declarations/' + d4.body.id + '/transfer',
    { transfer_unit: '绿源环保', operator: '李处置', vehicle: '沪B·00000' }, 'disposal');
  const w4 = await postR('/declarations/' + d4.body.id + '/weigh',
    { weight: 26.0 }, 'disposal');
  const rid4 = w4.body.review_id;
  check('RULE7: metal 26/20 diff 30% -> review_created',
    w4.status === 200 && w4.body.review_created === true && rid4 > 0,
    JSON.stringify(w4.body));
  // 通过
  const appr = await postR(`/declarations/reviews/${rid4}/approve`,
    { review_note: '差异经核实为废液沉淀沉淀，已确认', reviewer: '李处置' }, 'disposal');
  check('RULE7b: approve review ok',
    appr.status === 200, appr.status + ' ' + JSON.stringify(appr.body));
  const d4_after = (await j('/declarations')).body.find(dd => dd.id === d4.body.id);
  check('RULE7c: approve -> declaration status=weighed, locked=1',
    d4_after && d4_after.status === 'weighed' && d4_after.locked,
    JSON.stringify(d4_after));

  // --- 审核员角色权限验证 ---
  // 尝试用 lab 角色审批复核单，应被拒绝
  const rej_fail = await postR(`/declarations/reviews/${rid4}/approve`,
    { review_note: 'hacker attempt' }, 'lab');
  check('RULE7d: lab role approve -> 403 forbidden',
    rej_fail.status === 403, rej_fail.status + ' ' + JSON.stringify(rej_fail.body));

  // 汇总
  const cabs2 = (await j('/cabinets')).body;
  const a2 = cabs2.find(c => c.name === '暂存柜A');
  check('cabinet class_labels object map intact',
    a2.class_labels && typeof a2.class_labels === 'object' && !Array.isArray(a2.class_labels),
    JSON.stringify(a2.class_labels));

  const decls = (await j('/declarations')).body;
  const byStatus = decls.reduce((m, d) => { m[d.status] = (m[d.status] || 0) + 1; return m; }, {});
  log.push('final status distribution: ' + JSON.stringify(byStatus));

  const trs = (await j('/transfers')).body;
  log.push('transfer_records: ' + JSON.stringify(trs.map(t => t.barrel_code + ':' + (t.weight || '?') + 'kg'
    + (t.diff_percent ? ` diff=${t.diff_percent}%` : ''))));

  // dashboard 汇总
  const allReviews = (await j('/declarations/reviews/list')).body;
  log.push('review_orders: total=' + allReviews.length
    + ' pending=' + allReviews.filter(r => r.status === 'pending').length
    + ' approved=' + allReviews.filter(r => r.status === 'approved').length
    + ' rejected=' + allReviews.filter(r => r.status === 'rejected').length);

  log.unshift(`\n==== SMOKE RESULT: ${pass} passed, ${fail} failed ====`);
  console.log(log.join('\n'));
  if (fail > 0) process.exit(1);
})().catch(e => { console.error('SMOKE ERROR', e); process.exit(1); });
