import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import { StatusBadge, Loader, EmptyState } from '../components/ui.jsx';

export default function TransferPage() {
  const { role, roleInfo, pushToast } = useApp();
  const [stored, setStored] = useState([]);
  const [transferring, setTransferring] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [forms, setForms] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [st, tf] = await Promise.all([
        api.getDeclarations('stored'),
        api.getDeclarations('transferring'),
      ]);
      setStored(st); setTransferring(tf);
    } catch (e) { pushToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [pushToast]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setForms((prev) => {
      const next = { ...prev };
      for (const d of stored) {
        if (!next[d.id]) {
          next[d.id] = {
            transfer_unit: roleInfo[role].transfer_unit,
            operator: roleInfo[role].operator,
            vehicle: '',
          };
        }
      }
      return next;
    });
  }, [stored, role, roleInfo]);

  const setF = (id, k) => (e) => setForms((f) => ({ ...f, [id]: { ...f[id], [k]: e.target.value } }));

  const doTransfer = async (d) => {
    const f = forms[d.id] || {};
    if (!f.transfer_unit?.trim()) return pushToast('请填写处置单位', 'warn');
    if (!f.operator?.trim()) return pushToast('请填写操作人', 'warn');
    setBusyId(d.id);
    try {
      await api.transferDeclaration(d.id, {
        transfer_unit: f.transfer_unit.trim(),
        operator: f.operator.trim(),
        vehicle: f.vehicle.trim(),
      });
      pushToast(`桶码 ${d.barrel_code} 已登记转运`, 'success');
      await load();
    } catch (e) { pushToast(e.message, 'error'); }
    finally { setBusyId(null); }
  };

  if (loading) return <Loader />;

  return (
    <div>
      <div className="page-head">
        <h2>转运登记</h2>
        <p className="desc">处置单位将已暂存废液登记转运，进入「转运中」状态待称重。</p>
        <span className="role-hint">当前角色：{roleInfo[role].label}</span>
      </div>

      <div className="card">
        <h3 className="card-title">待转运废液 <span className="sub">（{stored.length} 桶已暂存）</span></h3>
        {stored.length === 0 ? <EmptyState icon="🚚" title="没有待转运的废液" hint="在「暂存」页完成入库后将显示在此" /> : (
          <div>
            {stored.map((d) => {
              const f = forms[d.id] || { transfer_unit: '', operator: '', vehicle: '' };
              return (
                <div className="item" key={d.id}>
                  <div className="item-head">
                    <div className="item-meta">
                      <span>桶码：<b className="mono">{d.barrel_code}</b></span>
                      <span className={`badge compat ${d.compat_class}`}>{d.compat_label}</span>
                      <span>暂存柜：{d.cabinet_name}</span>
                      {d.lab_name && <span>实验室：{d.lab_name}</span>}
                    </div>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <label className="field">
                      <span className="field-label">处置单位<em>*</em></span>
                      <input className="in" value={f.transfer_unit} onChange={setF(d.id, 'transfer_unit')} placeholder="如 绿源环保处置中心" />
                    </label>
                    <label className="field">
                      <span className="field-label">操作人<em>*</em></span>
                      <input className="in" value={f.operator} onChange={setF(d.id, 'operator')} placeholder="转运操作人" />
                    </label>
                    <label className="field">
                      <span className="field-label">运输方式/车牌</span>
                      <input className="in" value={f.vehicle} onChange={setF(d.id, 'vehicle')} placeholder="如 危货车 鲁B·XXXX" />
                    </label>
                  </div>
                  <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn primary" disabled={busyId === d.id} onClick={() => doTransfer(d)}>
                      {busyId === d.id ? '登记中…' : '登记转运'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">转运中（待称重）<span className="sub">（{transferring.length} 桶）</span></h3>
        {transferring.length === 0 ? <EmptyState icon="⚖️" title="没有转运中的废液" hint="登记转运后将进入称重环节" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>桶码</th><th>类别</th><th>暂存柜</th><th>处置单位</th><th>操作人</th><th>运输</th><th>状态</th></tr></thead>
              <tbody>
                {transferring.map((d) => (
                  <tr key={d.id}>
                    <td className="mono">{d.barrel_code}</td>
                    <td><span className={`badge compat ${d.compat_class}`}>{d.compat_label}</span></td>
                    <td>{d.cabinet_name}</td>
                    <td>{d.transfer_unit || '—'}</td>
                    <td>{d.transfer_operator || '—'}</td>
                    <td>{d.transfer_vehicle || '—'}</td>
                    <td><StatusBadge status={d.status} /></td>
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
