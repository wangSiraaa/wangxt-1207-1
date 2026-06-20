const B = 'http://127.0.0.1:19507/api';
const log = [];
let pass = 0, fail = 0;
function check(name, cond, got) {
  if (cond) { pass++; log.push(`  ✅ ${name}`); }
  else { fail++; log.push(`  ❌ ${name}  got=${got}`); }
}
async function j(path, opts) {
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

(async () => {
  const h = await j('/health');
  check('health ok', h.status === 200 && h.body.ok === true, JSON.stringify(h.body));

  const cats = (await j('/categories')).body;
  check('categories have compat_label', cats[0].compat_label, JSON.stringify(cats[0]));
  const cabs = (await j('/cabinets')).body;
  const cabA = cabs.find(c => c.name === '暂存柜A');
  const cabB = cabs.find(c => c.name === '暂存柜B');
  const cabC = cabs.find(c => c.name === '暂存柜C');

  // acid stored in A (A now holds acid, still 'stored')
  const d1 = await post('/declarations', { barrel_code: 'T-ACID-001', category_code: 'acid', lab_name: '有机化学实验室', submitter: '张实验' });
  check('declare via category_code', d1.status === 201, d1.status + ' ' + JSON.stringify(d1.body));
  const id1 = d1.body.id;
  const s1 = await post('/declarations/' + id1 + '/store', { cabinet_id: cabA.id });
  check('store acid in A ok', s1.status === 200, JSON.stringify(s1.body));

  // --- RULE 1: base into A (acid still stored) -> 400 incompatible ---
  const d2 = await post('/declarations', { barrel_code: 'T-BASE-001', category_code: 'base', lab_name: '无机化学实验室', submitter: '王实验' });
  const s2 = await post('/declarations/' + d2.body.id + '/store', { cabinet_id: cabA.id });
  check('RULE1: base into A (has acid) -> 400', s2.status === 400, s2.status + ' ' + JSON.stringify(s2.body));
  // store base in B (empty) -> ok, leave stored
  const s2b = await post('/declarations/' + d2.body.id + '/store', { cabinet_id: cabB.id });
  check('store base in B ok', s2b.status === 200, JSON.stringify(s2b.body));

  // organic into A (compatible with acid) -> stored
  const d3 = await post('/declarations', { barrel_code: 'T-ORG-001', category_code: 'organic', lab_name: '有机化学实验室', submitter: '张实验' });
  const s3 = await post('/declarations/' + d3.body.id + '/store', { cabinet_id: cabA.id });
  check('store organic in A (compat w/ acid) ok', s3.status === 200, JSON.stringify(s3.body));

  // --- RULE 2: cabinet C capacity=2, fill 2 then 3rd -> 400 ---
  const f1 = await post('/declarations', { barrel_code: 'T-ACID-002', category_code: 'acid', lab_name: '分析实验室', submitter: '刘实验' });
  const f2 = await post('/declarations', { barrel_code: 'T-ACID-003', category_code: 'acid', lab_name: '分析实验室', submitter: '刘实验' });
  const f3 = await post('/declarations', { barrel_code: 'T-ACID-004', category_code: 'acid', lab_name: '分析实验室', submitter: '刘实验' });
  await post('/declarations/' + f1.body.id + '/store', { cabinet_id: cabC.id });
  await post('/declarations/' + f2.body.id + '/store', { cabinet_id: cabC.id });
  const capFail = await post('/declarations/' + f3.body.id + '/store', { cabinet_id: cabC.id });
  check('RULE2: 3rd into full C -> 400', capFail.status === 400, capFail.status + ' ' + JSON.stringify(capFail.body));

  // --- RULE 3: transfer + weigh the acid barrel (still stored in A), then patch -> 400 locked ---
  const t1 = await post('/declarations/' + id1 + '/transfer', { transfer_unit: '绿源环保处置中心', operator: '李处置', vehicle: '沪B·12345' });
  check('transfer ok', t1.status === 200, JSON.stringify(t1.body));
  const w1 = await post('/declarations/' + id1 + '/weigh', { weight: 12.5 });
  check('weigh ok + locked', w1.status === 200 && w1.body.locked === true && w1.body.weight === 12.5, JSON.stringify(w1.body));
  const patchFail = await patch('/declarations/' + id1, { barrel_code: 'T-CHANGED-999' });
  check('RULE3: patch barrel after weigh -> 400', patchFail.status === 400, patchFail.status + ' ' + JSON.stringify(patchFail.body));

  // metal into B (compatible with base) -> transfer -> leave transferring
  const d4 = await post('/declarations', { barrel_code: 'T-MET-001', category_code: 'metal', lab_name: '材料实验室', submitter: '陈实验' });
  await post('/declarations/' + d4.body.id + '/store', { cabinet_id: cabB.id });
  const t4 = await post('/declarations/' + d4.body.id + '/transfer', { transfer_unit: '绿源环保处置中心', operator: '李处置', vehicle: '沪B·67890' });
  check('metal stored in B then transferred', t4.status === 200 && t4.body.status === 'transferring', JSON.stringify(t4.body));

  // one more pending (inorganic) so Declare page shows pending rows
  await post('/declarations', { barrel_code: 'T-INO-001', category_code: 'inorganic', lab_name: '无机化学实验室', submitter: '王实验' });

  // cabinets reflect classes/labels as object map (cabA holds acid+organic)
  const cabs2 = (await j('/cabinets')).body;
  const a2 = cabs2.find(c => c.name === '暂存柜A');
  check('cabinet class_labels is object map',
    a2.class_labels && typeof a2.class_labels === 'object' && !Array.isArray(a2.class_labels)
      && Object.keys(a2.class_labels).every((k) => typeof a2.class_labels[k] === 'string'),
    JSON.stringify(a2.class_labels));

  const decls = (await j('/declarations')).body;
  const byStatus = decls.reduce((m, d) => { m[d.status] = (m[d.status]||0)+1; return m; }, {});
  log.push('final status distribution: ' + JSON.stringify(byStatus));

  const trs = (await j('/transfers')).body;
  log.push('transfer_records: ' + JSON.stringify(trs.map(t => t.barrel_code + ':' + (t.weight||'?') + 'kg')));

  log.unshift(`\n==== SMOKE RESULT: ${pass} passed, ${fail} failed ====`);
  console.log(log.join('\n'));
  if (fail > 0) process.exit(1);
})().catch(e => { console.error('SMOKE ERROR', e); process.exit(1); });
