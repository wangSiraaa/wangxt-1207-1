import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import { StatusBadge, Loader, EmptyState, isIncompatible } from '../components/ui.jsx';

export default function StoragePage() {
  const { roleInfo, pushToast } = useApp();
  const [cabs, setCabs] = useState([]);
  const [pending, setPending] = useState([]);
  const [stored, setStored] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [sel, setSel] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cs, pend, st] = await Promise.all([
        api.getCabinets(),
        api.getDeclarations('pending'),
        api.getDeclarations('stored'),
      ]);
      setCabs(cs); setPending(pend); setStored(st);
    } catch (e) { pushToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [pushToast]);
  useEffect(() => { load(); }, [load]);

  const cabById = (id) => cabs.find((c) => String(c.id) === String(id));

  const preview = (decl, cabId) => {
    const cab = cabById(cabId);
    if (!cab) return null;
    if (cab.load >= cab.capacity) return { ok: false, msg: '该柜已达容量上限，无法提交' };
    const conflict = (cab.classes || []).find((cls) => isIncompatible(decl.compat_class, cls));
    if (conflict) {
      const clsLabel = cab.class_labels?.[conflict] || conflict;
      return { ok: false, msg: `相容性冲突：${decl.compat_label} 与柜内「${clsLabel}」不相容，不可同柜` };
    }
    return { ok: true };
  };

  const doStore = async (d) => {
    const cabId = sel[d.id];
    if (!cabId) return pushToast('请先选择暂存柜', 'warn');
    setBusyId(d.id);
    try {
      await api.storeDeclaration(d.id, cabId);
      pushToast(`桶码 ${d.barrel_code} 已暂存`, 'success');
      setSel((s) => { const n = { ...s }; delete n[d.id]; return n; });
      await load();
    } catch (e) { pushToast(e.message, 'error'); }
    finally { setBusyId(null); }
  };

  const doUnstore = async (d) => {
    if (!confirm(`确认将桶码「${d.barrel_code}」移出暂存柜？`)) return;
    setBusyId(d.id);
    try { await api.unstoreDeclaration(d.id); pushToast('已取消暂存', 'success'); await load(); }
    catch (e) { pushToast(e.message, 'error'); }
    finally { setBusyId(null); }
  };

  if (loading) return <Loader />;

  return (
    <div>
      <div className="page-head">
        <h2>暂存入库</h2>
        <p className="desc">学院安全员确认暂存柜容量与相容性，将待暂存废液入柜。</p>
        <span className="role-hint">当前角色：{roleInfo.officer.label}</span>
      </div>

      <div className="card">
        <h3 className="card-title">暂存柜状态 <span className="sub">（实时容量与存放类别）</span></h3>
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
                    <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>已存类别</div>
                    <div className="classes">
                      {c.classes.length === 0 ? <span className="muted" style={{ fontSize: 12 }}>（空柜）</span>
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
        <h3 className="card-title">待入库废液 <span className="sub">（{pending.length} 桶待暂存）</span></h3>
        {pending.length === 0 ? <EmptyState icon="✅" title="没有待暂存的废液" hint="实验室提交申报后将显示在此" /> : (
          <div>
            {pending.map((d) => {
              const cabId = sel[d.id] || '';
              const pv = cabId ? preview(d, cabId) : null;
              return (
                <div className="item" key={d.id}>
                  <div className="item-head">
                    <div className="item-meta">
                      <span>桶码：<b className="mono">{d.barrel_code}</b></span>
                      <span className={`badge compat ${d.compat_class}`}>{d.compat_label}</span>
                      {d.lab_name && <span>实验室：{d.lab_name}</span>}
                      {d.submitter && <span>提交人：{d.submitter}</span>}
                    </div>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="row-actions">
                    <span className="field-label" style={{ marginRight: 4 }}>选择暂存柜：</span>
                    <select className="in" style={{ width: 280 }} value={cabId}
                      onChange={(e) => setSel((s) => ({ ...s, [d.id]: e.target.value }))}>
                      <option value="">— 请选择 —</option>
                      {cabs.map((c) => {
                        const p = preview(d, c.id);
                        const tag = p && !p.ok ? '（不可用）' : `（剩余 ${c.capacity - c.load}）`;
                        return <option key={c.id} value={c.id} disabled={p && !p.ok}>
                          {c.name} · {c.classes.length ? c.classes.map((x) => c.class_labels?.[x] || x).join('/') : '空'} {tag}
                        </option>;
                      })}
                    </select>
                    <button className="btn primary" disabled={busyId === d.id || !cabId || (pv && !pv.ok)} onClick={() => doStore(d)}>
                      {busyId === d.id ? '处理中…' : '确认暂存'}
                    </button>
                    {pv && !pv.ok && <span className="warn-inline">⚠ {pv.msg}</span>}
                    {pv && pv.ok && <span className="ok-inline">✓ 相容且有空位，可入库</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">已暂存废液 <span className="sub">（{stored.length} 桶，可取消暂存）</span></h3>
        {stored.length === 0 ? <EmptyState icon="📦" title="暂存柜为空" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>桶码</th><th>类别</th><th>暂存柜</th><th>实验室</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {stored.map((d) => (
                  <tr key={d.id}>
                    <td className="mono">{d.barrel_code}</td>
                    <td><span className={`badge compat ${d.compat_class}`}>{d.compat_label}</span></td>
                    <td>{d.cabinet_name}</td>
                    <td>{d.lab_name || '—'}</td>
                    <td><StatusBadge status={d.status} /></td>
                    <td><button className="btn sm" disabled={busyId === d.id} onClick={() => doUnstore(d)}>取消暂存</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
