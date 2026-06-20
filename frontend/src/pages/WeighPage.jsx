import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import { StatusBadge, Loader, EmptyState } from '../components/ui.jsx';

export default function WeighPage() {
  const { role, roleInfo, pushToast } = useApp();
  const [transferring, setTransferring] = useState([]);
  const [weighed, setWeighed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [weights, setWeights] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tf, wh] = await Promise.all([
        api.getDeclarations('transferring'),
        api.getDeclarations('weighed'),
      ]);
      setTransferring(tf); setWeighed(wh);
    } catch (e) { pushToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [pushToast]);
  useEffect(() => { load(); }, [load]);

  const setW = (id, v) => setWeights((w) => ({ ...w, [id]: v }));

  const doWeigh = async (d) => {
    const w = parseFloat(weights[d.id]);
    if (!w || w <= 0) return pushToast('请输入有效的称重重量', 'warn');
    setBusyId(d.id);
    try {
      const res = await api.weighDeclaration(d.id, w);
      pushToast(`桶码 ${d.barrel_code} 称重确认完成（${res.weight} kg），桶码已锁定`, 'success');
      setWeights((w) => { const n = { ...w }; delete n[d.id]; return n; });
      await load();
    } catch (e) { pushToast(e.message, 'error'); }
    finally { setBusyId(null); }
  };

  if (loading) return <Loader />;

  return (
    <div>
      <div className="page-head">
        <h2>处置称重</h2>
        <p className="desc">处置单位登记转运称重，确认后桶码锁定，不可修改。</p>
        <span className="role-hint">当前角色：{roleInfo[role].label}</span>
      </div>

      <div className="card">
        <h3 className="card-title">待称重废液 <span className="sub">（{transferring.length} 桶转运中）</span></h3>
        {transferring.length === 0 ? <EmptyState icon="⚖️" title="没有待称重的废液" hint="在「转运」页登记转运后将显示在此" /> : (
          <div>
            <div className="note" style={{ background: 'var(--amber-l)', padding: 10, borderRadius: 8, marginBottom: 14 }}>
              <span className="ic">⚠</span><span><b>重要：</b>称重确认后单据将进入「已称重」并锁定，<b>桶码及所有信息不可再修改</b>。请核对无误后再确认。</span>
            </div>
            {transferring.map((d) => (
              <div className="item" key={d.id}>
                <div className="item-head">
                  <div className="item-meta">
                    <span>桶码：<b className="mono">{d.barrel_code}</b></span>
                    <span className={`badge compat ${d.compat_class}`}>{d.compat_label}</span>
                    <span>暂存柜：{d.cabinet_name}</span>
                    <span>处置单位：{d.transfer_unit || '—'}</span>
                    <span>转运人：{d.transfer_operator || '—'}</span>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
                <div className="row-actions">
                  <label className="field-label">称重重量 (kg)：</label>
                  <input className="in" style={{ width: 160 }} type="number" step="0.01" min="0"
                    value={weights[d.id] || ''} onChange={(e) => setW(d.id, e.target.value)} placeholder="如 12.50" />
                  <button className="btn primary" disabled={busyId === d.id} onClick={() => doWeigh(d)}>
                    {busyId === d.id ? '确认中…' : '称重确认（锁定）'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">已完成称重 <span className="sub">（{weighed.length} 桶，已锁定）</span></h3>
        {weighed.length === 0 ? <EmptyState icon="🔒" title="暂无已称重记录" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>桶码</th><th>类别</th><th>暂存柜</th><th>处置单位</th><th>称重重量</th><th>状态</th><th>桶码修改</th></tr></thead>
              <tbody>
                {weighed.map((d) => (
                  <tr key={d.id}>
                    <td className="mono"><span className="locked">🔒 {d.barrel_code}</span></td>
                    <td><span className={`badge compat ${d.compat_class}`}>{d.compat_label}</span></td>
                    <td>{d.cabinet_name || '—'}</td>
                    <td>{d.transfer_unit || '—'}</td>
                    <td><b>{d.weight} kg</b></td>
                    <td><StatusBadge status={d.status} /></td>
                    <td>
                      <input className="in" style={{ width: 140 }} value={d.barrel_code} disabled
                        title="已称重确认，单据已锁定，桶码不可修改" />
                    </td>
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
