import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { StatusBadge, Loader, EmptyState, INCOMPATIBLE_PAIRS } from '../components/ui.jsx';

const COMPAT_NAMES = { acid: '酸性', base: '碱性', oxidizer: '氧化性', reducer: '还原性' };

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

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

  const { decls, cabs, trs } = data;
  const cnt = (s) => decls.filter((d) => d.status === s).length;
  const stats = [
    { key: 'pending', label: '待暂存', n: cnt('pending'), cls: 'pending' },
    { key: 'stored', label: '已暂存', n: cnt('stored'), cls: 'stored' },
    { key: 'transferring', label: '转运中', n: cnt('transferring'), cls: 'transfer' },
    { key: 'weighed', label: '已称重(锁定)', n: cnt('weighed'), cls: 'weighed' },
  ];
  const recent = [...decls].sort((a, b) => (b.id - a.id)).slice(0, 8);
  const totalWeight = decls.reduce((s, d) => s + (Number(d.weight) || 0), 0);

  return (
    <div>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2>处理看板</h2>
          <p className="desc">三方协同：实验室申报 → 安全员暂存 → 处置单位转运称重</p>
        </div>
        <button className="btn" onClick={load}>↻ 刷新</button>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="stat"><i className="bar" /><div className="num">{decls.length}</div><div className="lab">废液桶总数</div></div>
        {stats.map((s) => (
          <div className={`stat ${s.cls}`} key={s.key}><i className="bar" /><div className="num">{s.n}</div><div className="lab">{s.label}</div></div>
        ))}
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3 className="card-title">暂存柜状态 <span className="sub">（容量 / 相容性实时监控）</span></h3>
          {cabs.length === 0 ? <EmptyState title="暂无暂存柜" /> : (
            <div className="grid cols-3">
              {cabs.map((c) => {
                const full = c.load >= c.capacity;
                return (
                  <div className={`cab ${full ? 'full' : ''}`} key={c.id}>
                    <h4>{c.name} {full ? <span className="tag" style={{ background: 'var(--red-l)', color: 'var(--red)' }}>已满</span> : null}</h4>
                    <div className="loc">📍 {c.location || '—'}</div>
                    <div className="capbar"><i style={{ width: `${(c.load / c.capacity) * 100}%` }} /></div>
                    <div className="cap-text"><span>已存 {c.load} 桶</span><span>容量 {c.capacity} 桶</span></div>
                    <div>
                      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>当前存放类别</div>
                      <div className="classes">
                        {c.classes.length === 0
                          ? <span className="muted" style={{ fontSize: 12 }}>（空）</span>
                          : c.classes.map((cls) => <span key={cls} className={`badge compat ${cls}`}>{c.class_labels?.[cls] || cls}</span>)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">相容性规则 <span className="sub">（强制约束）</span></h3>
          <div className="note" style={{ marginBottom: 12 }}><span className="ic">⚠</span>下列类别废液互相不相容，<b>禁止同柜暂存</b>：</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {INCOMPATIBLE_PAIRS.map(([a, b]) => (
              <div key={`${a}-${b}`} className="kv" style={{ justifyContent: 'center', gap: 10 }}>
                <span className={`badge compat ${a}`}>{COMPAT_NAMES[a] || a}</span>
                <span className="muted">✕</span>
                <span className={`badge compat ${b}`}>{COMPAT_NAMES[b] || b}</span>
                <span className="warn-inline" style={{ marginLeft: 6 }}>不可同柜</span>
              </div>
            ))}
          </div>
          <div className="divider" style={{ margin: '14px 0' }} />
          <div className="note"><span className="ic">⚠</span>暂存柜达容量上限时<b>禁止提交</b>入库。</div>
          <div className="note" style={{ marginTop: 8 }}><span className="ic">⚠</span>处置称重确认后<b>锁定桶码</b>，不可修改。</div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">最近申报 <span className="sub">（最新 8 条）</span></h3>
        {recent.length === 0 ? <EmptyState icon="🧪" title="还没有废液申报记录" hint="到「申报」页提交第一桶废液" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>桶码</th><th>类别</th><th>实验室</th><th>暂存柜</th><th>重量</th><th>状态</th></tr></thead>
              <tbody>
                {recent.map((d) => (
                  <tr key={d.id}>
                    <td className="mono">{d.barrel_code}</td>
                    <td><span className={`badge compat ${d.compat_class}`}>{d.compat_label}</span></td>
                    <td>{d.lab_name || '—'}</td>
                    <td>{d.cabinet_name || '—'}</td>
                    <td>{d.weight ? `${d.weight} kg` : <span className="muted">—</span>}</td>
                    <td><StatusBadge status={d.status} />{d.locked ? <span className="tag" style={{ marginLeft: 6, background: 'var(--green-l)', color: 'var(--green)' }}>🔒 锁定</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 12, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, color: 'var(--ink-2)' }}>
          <span>转运记录：<b style={{ color: 'var(--ink)' }}>{trs.length}</b> 条</span>
          <span>累计称重：<b style={{ color: 'var(--ink)' }}>{totalWeight.toFixed(2)}</b> kg</span>
        </div>
      </div>
    </div>
  );
}
