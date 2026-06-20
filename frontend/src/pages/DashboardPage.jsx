import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { StatusBadge, Loader, EmptyState, INCOMPATIBLE_PAIRS, HazardTags, ReviewStatusBadge, StepFlow } from '../components/ui.jsx';

const COMPAT_NAMES = { acid: '酸性', base: '碱性', oxidizer: '氧化性', reducer: '还原性', neutral: '中性', other: '其他' };

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try { setData(await api.getDashboard()); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Loader />;
  if (err) return (
    <div className="card">
      <p className="warn-inline">⚠ {err}</p>
      <div style={{ marginTop: 12 }}><button className="btn" onClick={load}>重新加载</button></div>
    </div>
  );

  const { decls, cabs, trs, reviews = [] } = data;
  const cnt = (s) => decls.filter((d) => d.status === s).length;
  const reviewCnt = {
    pending: reviews.filter((r) => r.status === 'pending').length,
    approved: reviews.filter((r) => r.status === 'approved').length,
    rejected: reviews.filter((r) => r.status === 'rejected').length,
  };
  const stats = [
    { key: 'pending', label: '待暂存', n: cnt('pending'), cls: 'pending', icon: '📋' },
    { key: 'stored', label: '已暂存', n: cnt('stored'), cls: 'stored', icon: '🗄️' },
    { key: 'transferring', label: '转运中', n: cnt('transferring'), cls: 'transfer', icon: '🚚' },
    { key: 'review_pending', label: '待复核', n: cnt('review_pending'), cls: 'review', icon: '🔍' },
    { key: 'weighed', label: '已称重(锁定)', n: cnt('weighed'), cls: 'weighed', icon: '🔒' },
  ];
  const recent = [...decls].sort((a, b) => (b.id - a.id)).slice(0, 10);
  const totalWeight = decls.reduce((s, d) => s + (Number(d.weight) || 0), 0);
  const totalDeclare = decls.reduce((s, d) => s + (Number(d.declare_weight) || 0), 0);

  const byCab = {};
  decls.forEach((d) => {
    if (d.cabinet_id) {
      if (!byCab[d.cabinet_id]) byCab[d.cabinet_id] = [];
      byCab[d.cabinet_id].push(d);
    }
  });

  return (
    <div>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2>闭环处理看板</h2>
          <p className="desc">相容性 → 柜位容量 → 转运称重 三环节闭环全流程监控</p>
        </div>
        <button className="btn" onClick={load}>↻ 刷新</button>
      </div>

      <div className="grid cols-5" style={{ marginBottom: 16 }}>
        <div className="stat"><i className="bar" /><div style={{ fontSize: 22, marginBottom: 4 }}>🧪</div><div className="num">{decls.length}</div><div className="lab">废液桶总数</div></div>
        {stats.map((s) => (
          <div className={`stat ${s.cls}`} key={s.key}>
            <i className="bar" /><div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
            <div className="num">{s.n}</div><div className="lab">{s.label}</div>
            {s.key === 'review_pending' && s.n > 0 && (
              <span className="tag" style={{ marginTop: 4, background: 'var(--red-l)', color: 'var(--red)' }}>
                需处理 {reviewCnt.pending}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="stat" style={{ background: 'linear-gradient(135deg, #f0f7ff 0%, #e6f0ff 100%)' }}>
          <div className="num" style={{ color: 'var(--blue)' }}>{(totalDeclare || 0).toFixed(1)} kg</div>
          <div className="lab">📊 申报总量</div>
        </div>
        <div className="stat" style={{ background: 'linear-gradient(135deg, #fff7f0 0%, #ffefe6 100%)' }}>
          <div className="num" style={{ color: 'var(--amber)' }}>{totalWeight.toFixed(1)} kg</div>
          <div className="lab">⚖️ 实际称重总量</div>
        </div>
        <div className="stat" style={{ background: 'linear-gradient(135deg, #f0fff4 0%, #e6ffec 100%)' }}>
          <div className="num" style={{ color: 'var(--green)' }}>{reviews.length}</div>
          <div className="lab">📋 复核单总数（待处理 {reviewCnt.pending}）</div>
        </div>
        <div className="stat" style={{ background: 'linear-gradient(135deg, #fffaf0 0%, #fff3e6 100%)' }}>
          <div className="num" style={{ color: 'var(--orange)' }}>{trs.length}</div>
          <div className="lab">🚚 转运记录</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3 className="card-title">暂存柜实时状态 <span className="sub">（容量 / 相容性 / 柜内明细）</span></h3>
          {cabs.length === 0 ? <EmptyState title="暂无暂存柜" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cabs.map((c) => {
                const full = c.load >= c.capacity;
                const items = byCab[c.id] || [];
                return (
                  <div className={`cab ${full ? 'full' : ''}`} key={c.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h4>{c.name} {full ? <span className="tag" style={{ background: 'var(--red-l)', color: 'var(--red)' }}>已满</span> : null}</h4>
                        <div className="loc">📍 {c.location || '—'}</div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 12 }}>
                        <div>装载率 <b style={{ color: full ? 'var(--red)' : 'var(--green)' }}>
                          {c.capacity ? Math.round((c.load / c.capacity) * 100) : 0}%
                        </b></div>
                      </div>
                    </div>
                    <div className="capbar"><i style={{ width: `${(c.load / c.capacity) * 100}%` }} /></div>
                    <div className="cap-text"><span>已存 {c.load} 桶</span><span>容量 {c.capacity} 桶</span></div>
                    <div style={{ margin: '8px 0' }}>
                      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>当前存放相容性分类</div>
                      <div className="classes">
                        {c.classes.length === 0
                          ? <span className="muted" style={{ fontSize: 12 }}>（空）</span>
                          : c.classes.map((cls) => <span key={cls} className={`badge compat ${cls}`}>{c.class_labels?.[cls] || COMPAT_NAMES[cls] || cls}</span>)}
                      </div>
                    </div>
                    {items.length > 0 && (
                      <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>柜内桶明细（{items.length}）</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
                          {items.map((d) => (
                            <div key={d.id} className="ro-row ro-card"
                              style={{ cursor: 'pointer', padding: '6px 10px' }}
                              onClick={() => setDetail(d)}>
                              <span className="mono" style={{ fontSize: 12 }}>{d.barrel_code}</span>
                              <span className={`badge compat ${d.compat_class}`} style={{ transform: 'scale(0.8)' }}>{d.compat_label}</span>
                              <HazardTags list={d.hazard_list} small />
                              <StatusBadge status={d.status} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">闭环规则 · 相容性矩阵 <span className="sub">（强制阻断约束）</span></h3>
          <div className="note" style={{ marginBottom: 12, background: 'var(--red-l)', color: 'var(--red)' }}>
            <span className="ic">🛑</span>违反任一规则，安全员在暂存确认时<b>直接阻断入库</b>。
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {INCOMPATIBLE_PAIRS.map(([a, b]) => (
              <div key={`${a}-${b}`} className="kv" style={{ justifyContent: 'center', gap: 10 }}>
                <span className={`badge compat ${a}`}>{COMPAT_NAMES[a] || a}</span>
                <span className="muted" style={{ color: 'var(--red)', fontWeight: 700 }}>✕ 不相容</span>
                <span className={`badge compat ${b}`}>{COMPAT_NAMES[b] || b}</span>
                <span className="warn-inline" style={{ marginLeft: 6, background: 'var(--red-l)', color: 'var(--red)' }}>阻断同柜</span>
              </div>
            ))}
          </div>
          <div className="divider" style={{ margin: '14px 0' }} />
          <div className="note"><span className="ic">🛑</span>暂存柜达容量上限时<b>禁止提交</b>入库。</div>
          <div className="note" style={{ marginTop: 8 }}><span className="ic">🔒</span>处置称重确认后<b>锁定桶码</b>，所有字段不可修改。</div>
          <div className="note" style={{ marginTop: 8 }}><span className="ic">🔍</span>实际重量与申报量差异超过<b>20%</b>自动生成复核单。</div>
        </div>
      </div>

      {reviewCnt.pending > 0 && (
        <div className="review-banner" style={{ marginBottom: 16 }}>
          <span className="ic">🔍</span>
          <span><b>{reviewCnt.pending}</b> 份复核单待处理，涉及 <b>{cnt('review_pending')}</b> 桶废液。请前往「称重 · 复核」页处理。</span>
        </div>
      )}

      <div className="card">
        <h3 className="card-title">全流程跟踪 · 最近 10 桶 <span className="sub">（点击行查看闭环详情）</span></h3>
        {recent.length === 0 ? <EmptyState icon="🧪" title="还没有废液申报记录" hint="到「申报」页提交第一桶废液" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr>
                <th>桶码</th><th>类别</th><th>危险特性</th>
                <th>申报重量</th><th>实际</th><th>差异</th>
                <th>实验室</th><th>柜位</th><th>闭环步骤</th>
              </tr></thead>
              <tbody>
                {recent.map((d) => (
                  <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(d)}>
                    <td className="mono">{d.locked ? <span className="locked">🔒 {d.barrel_code}</span> : d.barrel_code}</td>
                    <td><span className={`badge compat ${d.compat_class}`}>{d.compat_label}</span></td>
                    <td><HazardTags list={d.hazard_list} small /></td>
                    <td>{d.declare_weight ? `${d.declare_weight} kg` : <span className="muted">—</span>}</td>
                    <td><b>{d.weight ? `${d.weight} kg` : <span className="muted">—</span>}</b></td>
                    <td>{d.diff ? (
                      <span style={{
                        color: d.diff.needs_review ? 'var(--red)' : 'var(--green)',
                        fontWeight: 600,
                      }}>
                        {d.diff.needs_review ? '🔍 ' : ''}
                        ±{d.diff.diff_weight}kg ({d.diff.diff_percent}%)
                      </span>
                    ) : <span className="muted">—</span>}</td>
                    <td>{d.lab_name || '—'}</td>
                    <td>{d.cabinet_name || <span className="muted">未分配</span>}</td>
                    <td><StatusBadge status={d.status} />{d.locked ? <span className="tag" style={{ marginLeft: 6, background: 'var(--green-l)', color: 'var(--green)' }}>🔒</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 12, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, color: 'var(--ink-2)' }}>
          <span>转运记录：<b style={{ color: 'var(--ink)' }}>{trs.length}</b> 条</span>
          <span>累计申报：<b style={{ color: 'var(--ink)' }}>{totalDeclare.toFixed(2)}</b> kg</span>
          <span>累计称重：<b style={{ color: 'var(--ink)' }}>{totalWeight.toFixed(2)}</b> kg</span>
          {reviews.length > 0 && <>
            <span>复核单：<b style={{ color: 'var(--green)' }}>通过 {reviewCnt.approved}</b> / <b style={{ color: 'var(--amber)' }}>待处理 {reviewCnt.pending}</b> / <b style={{ color: 'var(--red)' }}>驳回 {reviewCnt.rejected}</b></span>
          </>}
        </div>
      </div>

      {detail && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(12,22,40,0.55)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => setDetail(null)}
        >
          <div className="card" style={{ maxWidth: 760, width: '100%', maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="card-title">桶 <span className="mono">{detail.barrel_code}</span> 闭环全流程详情</h3>
              <button className="btn sm" onClick={() => setDetail(null)}>关闭 ✕</button>
            </div>
            <StepFlow status={detail.status} />
            <div className="decl-card">
              <div className="decl-grid">
                <div><div className="decl-k">废液类别</div><div className="decl-v"><span className={`badge compat ${detail.compat_class}`}>{detail.compat_label}</span></div></div>
                <div><div className="decl-k">危险特性</div><div className="decl-v"><HazardTags list={detail.hazard_list} small /></div></div>
                <div><div className="decl-k">暂存柜</div><div className="decl-v">{detail.cabinet_name || <span className="muted">—</span>}</div></div>
                <div><div className="decl-k">实验室</div><div className="decl-v">{detail.lab_name || '—'}</div></div>
                <div><div className="decl-k">提交人</div><div className="decl-v">{detail.submitter || '—'}</div></div>
                <div><div className="decl-k">状态</div><div className="decl-v"><StatusBadge status={detail.status} />{detail.locked ? <span className="tag" style={{ marginLeft: 6, background: 'var(--green-l)', color: 'var(--green)' }}>🔒 锁定</span> : null}</div></div>
              </div>
            </div>
            <div className="form-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div><div className="decl-k" style={{ marginTop: 10 }}>申报预估</div><div className="decl-v" style={{ fontSize: 16, fontWeight: 600 }}>{detail.declare_weight || '—'} kg</div></div>
              <div><div className="decl-k" style={{ marginTop: 10 }}>实际称重</div><div className="decl-v" style={{ fontSize: 16, fontWeight: 600 }}>{detail.weight || '—'} kg</div></div>
              <div><div className="decl-k" style={{ marginTop: 10 }}>处置单位</div><div className="decl-v">{detail.transfer_unit || '—'}</div></div>
            </div>
            {detail.diff && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 6 }}>申报 vs 实际差异：</div>
                <div className={detail.diff.needs_review ? 'alert alert-danger' : 'note'}
                  style={{ padding: 12, borderRadius: 8, background: detail.diff.needs_review ? 'var(--red-l)' : 'var(--blue-l)', color: detail.diff.needs_review ? 'var(--red)' : 'var(--blue)' }}>
                  <span className="ic">{detail.diff.needs_review ? '🔍' : '✅'}</span>
                  <span>
                    差异 <b>±{detail.diff.diff_weight} kg</b>（{detail.diff.diff_percent}%），
                    阈值 {detail.diff.threshold || 20}%，
                    {detail.diff.needs_review ? <b>已触发自动复核单</b> : '差异在允许范围内'}。
                  </span>
                </div>
              </div>
            )}
            {detail.remark && (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ fontSize: 12 }}>备注</div>
                <div className="note" style={{ marginTop: 4, padding: 10, borderRadius: 8 }}>{detail.remark}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
