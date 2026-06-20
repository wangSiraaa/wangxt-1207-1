import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import { StatusBadge, Loader, EmptyState, WeightDiffBar, HazardTags, ReviewStatusBadge, Field, StepFlow, Modal } from '../components/ui.jsx';

export default function WeighPage() {
  const { role, roleInfo, pushToast } = useApp();
  const [transferring, setTransferring] = useState([]);
  const [weighed, setWeighed] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [weights, setWeights] = useState({});
  const [reviewModal, setReviewModal] = useState(null);
  const [reviewForm, setReviewForm] = useState({ review_note: '', reviewer: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tf, wh, rs] = await Promise.all([
        api.getDeclarations('transferring'),
        api.getDeclarations('weighed'),
        api.getReviews(),
      ]);
      setTransferring(tf);
      const rp = await api.getDeclarations('review_pending').catch(() => []);
      setWeighed([...wh, ...rp]);
      setReviews(rs);
    } catch (e) { pushToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [pushToast]);
  useEffect(() => { load(); }, [load]);

  const setW = (id, v) => setWeights((w) => ({ ...w, [id]: v }));

  const doWeigh = async (d) => {
    const w = parseFloat(weights[d.id]);
    if (!w || w <= 0 || isNaN(w)) return pushToast('请输入有效的称重重量', 'warn');
    setBusyId(d.id);
    try {
      const res = await api.weighDeclaration(d.id, w);
      if (res.review_created) {
        pushToast(`⚠️ 已称重，差异${res.diff?.diff_percent}%，已自动生成复核单`, 'warn');
      } else {
        pushToast(`桶码 ${d.barrel_code} 称重确认完成（${res.weight} kg），桶码已锁定`, 'success');
      }
      setWeights((w) => { const n = { ...w }; delete n[d.id]; return n; });
      await load();
    } catch (e) { pushToast(e.message, 'error'); }
    finally { setBusyId(null); }
  };

  const openReview = (r) => {
    setReviewModal(r);
    setReviewForm({ review_note: r.review_note || '', reviewer: roleInfo[role].operator || '' });
  };

  const doApprove = async () => {
    if (!reviewModal) return;
    setBusyId(reviewModal.id);
    try {
      await api.approveReview(reviewModal.id, {
        review_note: reviewForm.review_note.trim() || null,
        reviewer: reviewForm.reviewer.trim() || null,
      });
      pushToast('复核通过，称重已确认生效', 'success');
      setReviewModal(null);
      await load();
    } catch (e) { pushToast(e.message, 'error'); }
    finally { setBusyId(null); }
  };

  const doReject = async () => {
    if (!reviewModal) return;
    if (!reviewForm.review_note.trim()) return pushToast('驳回需填写复核说明', 'warn');
    setBusyId(reviewModal.id);
    try {
      await api.rejectReview(reviewModal.id, {
        review_note: reviewForm.review_note.trim(),
        reviewer: reviewForm.reviewer.trim() || null,
      });
      pushToast('已驳回，称重数据将允许重新录入', 'warn');
      setReviewModal(null);
      await load();
    } catch (e) { pushToast(e.message, 'error'); }
    finally { setBusyId(null); }
  };

  const pendingReviews = reviews.filter((r) => r.status === 'pending');
  const doneReviews = reviews.filter((r) => r.status !== 'pending');

  if (loading) return <Loader />;

  const rp = weighed.filter((d) => d.status === 'review_pending');
  const wh = weighed.filter((d) => d.status === 'weighed');

  return (
    <div>
      <div className="page-head">
        <h2>处置称重 · 复核</h2>
        <p className="desc">处置单位登记转运称重；差异超过阈值自动生成复核单，由安全员或处置单位复核确认。</p>
        <span className="role-hint">当前角色：{roleInfo[role].label}</span>
      </div>

      {pendingReviews.length > 0 && (role === 'officer' || role === 'disposal') && (
        <div className="review-banner">
          <span className="ic">🔍</span>
          <span>有 <b>{pendingReviews.length}</b> 份复核单待处理，请在下方「待复核」区域查看并确认。</span>
        </div>
      )}

      <div className="card">
        <h3 className="card-title">待称重废液 <span className="sub">（{transferring.length} 桶转运中）</span></h3>
        {role !== 'disposal' && (
          <div className="note" style={{ background: 'var(--amber-l)', padding: 10, borderRadius: 8, marginBottom: 14 }}>
            <span className="ic">🔒</span>
            <span>当前角色为<b>「{roleInfo[role].label}」</b>，<b>处置称重</b>操作仅「处置单位」角色可执行。</span>
          </div>
        )}
        {transferring.length === 0 ? <EmptyState icon="⚖️" title="没有待称重的废液" hint="在「转运」页登记转运后将显示在此" /> : (
          <div>
            <div className="note" style={{ background: 'var(--amber-l)', padding: 10, borderRadius: 8, marginBottom: 14 }}>
              <span className="ic">⚠</span><span><b>重要：</b>称重确认后单据将进入「已称重」或「待复核」，<b>桶码及所有信息不可再修改</b>。差异超过阈值将自动生成复核单。</span>
            </div>
            {transferring.map((d) => {
              const inputW = parseFloat(weights[d.id] || 0);
              const preview = (inputW > 0 && d.declare_weight > 0) ? (() => {
                const diff = Math.abs(inputW - d.declare_weight);
                const pct = (diff / d.declare_weight) * 100;
                return {
                  diff_weight: Math.round(diff * 100) / 100,
                  diff_percent: Math.round(pct * 100) / 100,
                  needs_review: pct > 20,
                  threshold: 20,
                };
              })() : null;
              return (
                <div className="item" key={d.id}>
                  <div className="item-head">
                    <div className="item-meta">
                      <span>桶码：<b className="mono">{d.barrel_code}</b></span>
                      <span className={`badge compat ${d.compat_class}`}>{d.compat_label}</span>
                      <span>申报：{d.declare_weight} kg</span>
                      <span>暂存柜：{d.cabinet_name}</span>
                      <span>处置单位：{d.transfer_unit || '—'}</span>
                    </div>
                    <StatusBadge status={d.status} />
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <HazardTags list={d.hazard_list} small />
                  </div>
                  {preview && (
                    <WeightDiffBar
                      diff={preview}
                      declare_weight={d.declare_weight}
                      weight={inputW}
                    />
                  )}
                  <div className="row-actions">
                    <label className="field-label">称重重量 (kg)：</label>
                    <input className="in" style={{ width: 160 }} type="number" step="0.01" min="0"
                      disabled={role !== 'disposal'}
                      value={weights[d.id] || ''} onChange={(e) => setW(d.id, e.target.value)} placeholder="如 12.50" />
                    <button className="btn primary" disabled={role !== 'disposal' || busyId === d.id} onClick={() => doWeigh(d)}>
                      {busyId === d.id ? '确认中…' : '称重确认'}
                    </button>
                    {role !== 'disposal' && <span className="muted" style={{ fontSize: 12 }}>（仅处置单位可操作）</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">
          待复核 <span className="sub">（{rp.length} 桶差异超过阈值）</span>
          {(role === 'officer' || role === 'disposal') && pendingReviews.length > 0
            ? <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>
              共 {pendingReviews.length} 份复核单待处理
            </span> : null}
        </h3>
        {role !== 'officer' && role !== 'disposal' && pendingReviews.length > 0 && (
          <div className="note" style={{ background: 'var(--amber-l)', padding: 10, borderRadius: 8, marginBottom: 14 }}>
            <span className="ic">🔒</span>
            <span>当前角色为<b>「{roleInfo[role].label}」</b>，<b>复核操作</b>仅「学院安全员」或「处置单位」可执行。</span>
          </div>
        )}
        {rp.length === 0 && pendingReviews.length === 0
          ? <EmptyState icon="✅" title="没有待复核的记录" hint="称重差异超过阈值将显示在此" />
          : (
            pendingReviews.map((r) => {
              const decl = rp.find((d) => d.declaration_id === r.declaration_id || d.id === r.declaration_id);
              return (
                <div className="ro-card" key={r.id}>
                  <div className="ro-head">
                    <div className="ro-title">
                      复核单 #{r.id} · 桶码 <span className="mono">{r.barrel_code}</span>
                    </div>
                    <ReviewStatusBadge status={r.status} />
                  </div>
                  <div className="ro-row">
                    <div><div className="ro-k">申报重量</div><div className="ro-v">{r.declare_weight} kg</div></div>
                    <div><div className="ro-k">实际重量</div><div className="ro-v">{r.actual_weight} kg</div></div>
                    <div><div className="ro-k">差异</div><div className="ro-v" style={{ color: 'var(--red)' }}>
                      ±{r.diff_weight} kg（{r.diff_percent}%）
                    </div></div>
                    <div><div className="ro-k">危险特性</div><div className="ro-v"><HazardTags list={r.hazard_list} small /></div></div>
                  </div>
                  <div className="row-actions" style={{ marginTop: 10 }}>
                    <button className="btn sm" onClick={() => openReview(r)} disabled={busyId === r.id}>
                      查看 / 处理
                    </button>
                    {decl && <button className="btn sm ghost" onClick={() => {
                      pushToast(`申报单号：${r.declaration_id}`, 'info');
                    }}>关联申报单</button>}
                  </div>
                </div>
              );
            })
          )}
      </div>

      <div className="card">
        <h3 className="card-title">已完成称重 / 已处理复核 <span className="sub">（{wh.length} 桶已确认，{doneReviews.length} 份历史复核）</span></h3>
        {wh.length === 0 && doneReviews.length === 0
          ? <EmptyState icon="🔒" title="暂无已称重记录" />
          : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr>
                  <th>桶码</th><th>类别</th><th>危险特性</th>
                  <th>申报</th><th>实际</th><th>差异</th>
                  <th>暂存柜</th><th>处置单位</th>
                  <th>状态</th><th>桶码修改</th>
                </tr></thead>
                <tbody>
                  {wh.map((d) => (
                    <tr key={d.id}>
                      <td className="mono"><span className="locked">🔒 {d.barrel_code}</span></td>
                      <td><span className={`badge compat ${d.compat_class}`}>{d.compat_label}</span></td>
                      <td><HazardTags list={d.hazard_list} small /></td>
                      <td>{d.declare_weight} kg</td>
                      <td><b>{d.weight} kg</b></td>
                      <td>{d.diff ? (
                        <span style={{ color: d.diff.needs_review ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                          ±{d.diff.diff_weight}kg ({d.diff.diff_percent}%)
                        </span>
                      ) : <span className="muted">—</span>}</td>
                      <td>{d.cabinet_name || '—'}</td>
                      <td>{d.transfer_unit || '—'}</td>
                      <td><StatusBadge status={d.status} /></td>
                      <td>
                        <input className="in" style={{ width: 140 }} value={d.barrel_code} disabled
                          title="已称重确认，单据已锁定，桶码不可修改" />
                      </td>
                    </tr>
                  ))}
                  {doneReviews.map((r) => (
                    <tr key={`ro-${r.id}`} style={{ background: '#fafcfe' }}>
                      <td className="mono" colSpan="2">📋 复核单 #{r.id} · {r.barrel_code}</td>
                      <td><HazardTags list={r.hazard_list} small /></td>
                      <td>{r.declare_weight} kg</td>
                      <td>{r.actual_weight} kg</td>
                      <td style={{ color: 'var(--red)', fontWeight: 600 }}>
                        ±{r.diff_weight}kg ({r.diff_percent}%)
                      </td>
                      <td colSpan="2" className="small-txt muted">{r.reviewer || ''} · {r.review_note || ''}</td>
                      <td colSpan="2"><ReviewStatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      <Modal
        open={!!reviewModal}
        wide
        title={`复核单 #${reviewModal?.id || ''} · ${reviewModal?.barrel_code || ''}`}
        onClose={() => setReviewModal(null)}
        footer={reviewModal && reviewModal.status === 'pending' && (role === 'officer' || role === 'disposal') ? (
          <>
            <button className="btn" onClick={() => setReviewModal(null)}>取消</button>
            <button className="btn danger" disabled={busyId === reviewModal.id} onClick={doReject}>
              {busyId === reviewModal.id ? '处理中…' : '驳回（重新称重）'}
            </button>
            <button className="btn primary" disabled={busyId === reviewModal.id} onClick={doApprove}>
              {busyId === reviewModal.id ? '处理中…' : '通过（确认称重）'}
            </button>
          </>
        ) : <button className="btn" onClick={() => setReviewModal(null)}>关闭</button>}
      >
        {reviewModal && (
          <>
            {rp.find((d) => d.id === reviewModal.declaration_id) && (
              <StepFlow status={rp.find((d) => d.id === reviewModal.declaration_id)?.status || 'review_pending'} />
            )}
            <div className="decl-card">
              <div className="decl-grid">
                <div><div className="decl-k">桶码</div><div className="decl-v mono">{reviewModal.barrel_code}</div></div>
                <div><div className="decl-k">复核状态</div><div className="decl-v"><ReviewStatusBadge status={reviewModal.status} /></div></div>
                <div><div className="decl-k">危险特性</div><div className="decl-v"><HazardTags list={reviewModal.hazard_list} small /></div></div>
              </div>
            </div>
            <WeightDiffBar
              diff={{
                diff_weight: reviewModal.diff_weight,
                diff_percent: reviewModal.diff_percent,
                needs_review: true,
                threshold: 20,
              }}
              declare_weight={reviewModal.declare_weight}
              weight={reviewModal.actual_weight}
            />
            <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Field label="复核人">
                <input className="in" value={reviewForm.reviewer}
                  disabled={reviewModal.status !== 'pending' || (role !== 'officer' && role !== 'disposal')}
                  onChange={(e) => setReviewForm((f) => ({ ...f, reviewer: e.target.value }))}
                  placeholder="如 李安全员" />
              </Field>
              <Field label={reviewModal.status === 'rejected' ? '驳回原因' : '复核说明'} hint={reviewModal.status === 'pending' ? '驳回填必填' : '—'}>
                <input className="in" value={reviewForm.review_note}
                  disabled={reviewModal.status !== 'pending' || (role !== 'officer' && role !== 'disposal')}
                  onChange={(e) => setReviewForm((f) => ({ ...f, review_note: e.target.value }))}
                  placeholder="说明差异原因或确认意见" />
              </Field>
            </div>
            {reviewModal.status !== 'pending' && (
              <div className={`note ${reviewModal.status === 'approved' ? '' : ''}`}
                style={{
                  background: reviewModal.status === 'approved' ? 'var(--green-l)' : 'var(--red-l)',
                  padding: 10, borderRadius: 8,
                  color: reviewModal.status === 'approved' ? 'var(--green)' : 'var(--red)',
                }}>
                <span className="ic">{reviewModal.status === 'approved' ? '✅' : '❌'}</span>
                <span>
                  {reviewModal.status === 'approved' ? '复核通过，称重已确认生效。' : '复核驳回，称重数据可重新录入。'}
                  {reviewModal.reviewer ? ` 复核人：${reviewModal.reviewer}` : ''}
                  {reviewModal.review_note ? ` · ${reviewModal.review_note}` : ''}
                </span>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
