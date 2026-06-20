import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import { StatusBadge, Field, Loader, EmptyState, Modal } from '../components/ui.jsx';

export default function DeclarePage() {
  const { role, roleInfo, pushToast } = useApp();
  const [cats, setCats] = useState([]);
  const [decls, setDecls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ barrel_code: '', category_code: '', lab_name: '', submitter: '', remark: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, d] = await Promise.all([api.getCategories(), api.getDeclarations()]);
      setCats(c); setDecls(d);
    } catch (e) { pushToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [pushToast]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setForm((f) => ({ ...f, submitter: roleInfo[role].submitter }));
  }, [role, roleInfo]);

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.barrel_code.trim()) return pushToast('请填写桶码', 'warn');
    if (!form.category_code) return pushToast('请选择废液类别', 'warn');
    setSubmitting(true);
    try {
      await api.createDeclaration({
        barrel_code: form.barrel_code.trim(),
        category_code: form.category_code,
        lab_name: form.lab_name.trim(),
        submitter: form.submitter.trim(),
        remark: form.remark.trim(),
      });
      pushToast('申报成功，等待安全员暂存确认', 'success');
      setForm({ barrel_code: '', category_code: '', lab_name: '', submitter: roleInfo[role].submitter, remark: '' });
      await load();
    } catch (e) { pushToast(e.message, 'error'); }
    finally { setSubmitting(false); }
  };

  const saveEdit = async () => {
    setSubmitting(true);
    try {
      await api.updateDeclaration(editing.id, {
        barrel_code: editing.barrel_code.trim(),
        category_code: editing.category_code,
        lab_name: editing.lab_name.trim(),
        submitter: editing.submitter.trim(),
        remark: editing.remark.trim(),
      });
      pushToast('修改已保存', 'success');
      setEditing(null);
      await load();
    } catch (e) { pushToast(e.message, 'error'); }
    finally { setSubmitting(false); }
  };

  const del = async (d) => {
    if (!confirm(`确认删除桶码「${d.barrel_code}」的申报？`)) return;
    try { await api.deleteDeclaration(d.id); pushToast('已删除', 'success'); await load(); }
    catch (e) { pushToast(e.message, 'error'); }
  };

  if (loading) return <Loader />;

  return (
    <div>
      <div className="page-head">
        <h2>废液申报</h2>
        <p className="desc">实验室填写桶码与废液类别，提交后进入「待暂存」状态。</p>
        <span className="role-hint">当前角色：{roleInfo[role].label}</span>
      </div>

      <div className="card">
        <h3 className="card-title">新建申报</h3>
        <div className="form-row">
          <Field label="桶码" required hint="唯一标识，称重后将锁定">
            <input className="in" value={form.barrel_code} onChange={setF('barrel_code')} placeholder="如 BAR-2025-0001" />
          </Field>
          <Field label="废液类别" required>
            <select className="in" value={form.category_code} onChange={setF('category_code')}>
              <option value="">请选择</option>
              {cats.map((c) => <option key={c.code} value={c.code}>{c.name}（{c.compat_label}）</option>)}
            </select>
          </Field>
          <Field label="实验室名称">
            <input className="in" value={form.lab_name} onChange={setF('lab_name')} placeholder="如 化学楼302实验室" />
          </Field>
          <Field label="提交人">
            <input className="in" value={form.submitter} onChange={setF('submitter')} placeholder="申报人姓名" />
          </Field>
          <Field label="备注（可选）">
            <input className="in" value={form.remark} onChange={setF('remark')} placeholder="废液描述、体积、浓度等" />
          </Field>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
          <button className="btn primary" disabled={submitting} onClick={submit}>{submitting ? '提交中…' : '提交申报'}</button>
          <button className="btn" onClick={() => setForm({ barrel_code: '', category_code: '', lab_name: '', submitter: roleInfo[role].submitter, remark: '' })}>清空</button>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">申报记录 <span className="sub">（共 {decls.length} 条）</span></h3>
        {decls.length === 0 ? <EmptyState icon="🧪" title="暂无申报" hint="在上方表单提交第一桶废液" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>桶码</th><th>类别</th><th>实验室</th><th>提交人</th><th>暂存柜</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {decls.map((d) => (
                  <tr key={d.id}>
                    <td className="mono">{d.locked ? <span className="locked">🔒 {d.barrel_code}</span> : d.barrel_code}</td>
                    <td><span className={`badge compat ${d.compat_class}`}>{d.compat_label}</span></td>
                    <td>{d.lab_name || '—'}</td>
                    <td>{d.submitter || '—'}</td>
                    <td>{d.cabinet_name || <span className="muted">未分配</span>}</td>
                    <td><StatusBadge status={d.status} /></td>
                    <td>
                      <div className="row-actions">
                        <button className="btn sm" onClick={() => setEditing({ ...d })}>
                          {d.locked ? '详情' : '编辑'}
                        </button>
                        {!d.locked && d.status === 'pending' && (
                          <button className="btn sm danger" onClick={() => del(d)}>删除</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={!!editing}
        title={editing && editing.locked ? '申报详情（已锁定）' : '编辑申报'}
        onClose={() => setEditing(null)}
        footer={editing && !editing.locked ? (
          <>
            <button className="btn" onClick={() => setEditing(null)}>取消</button>
            <button className="btn primary" disabled={submitting} onClick={saveEdit}>{submitting ? '保存中…' : '保存'}</button>
          </>
        ) : <button className="btn" onClick={() => setEditing(null)}>关闭</button>}
      >
        {editing && (
          <>
            {editing.locked && (
              <div className="note" style={{ background: 'var(--green-l)', padding: 10, borderRadius: 8 }}>
                <span className="ic" style={{ color: 'var(--green)' }}>🔒</span>该废液已完成处置称重，单据已锁定，桶码及信息不可修改。
              </div>
            )}
            <Field label="桶码" required>
              <input className="in" value={editing.barrel_code} disabled={editing.locked}
                onChange={(e) => setEditing({ ...editing, barrel_code: e.target.value })} />
            </Field>
            <Field label="废液类别" required>
              <select className="in" value={editing.category_code} disabled={editing.locked}
                onChange={(e) => setEditing({ ...editing, category_code: e.target.value })}>
                <option value="">请选择</option>
                {cats.map((c) => <option key={c.code} value={c.code}>{c.name}（{c.compat_label}）</option>)}
              </select>
            </Field>
            <Field label="实验室名称">
              <input className="in" value={editing.lab_name || ''} disabled={editing.locked}
                onChange={(e) => setEditing({ ...editing, lab_name: e.target.value })} />
            </Field>
            <Field label="提交人">
              <input className="in" value={editing.submitter || ''} disabled={editing.locked}
                onChange={(e) => setEditing({ ...editing, submitter: e.target.value })} />
            </Field>
            <Field label="备注">
              <input className="in" value={editing.remark || ''} disabled={editing.locked}
                onChange={(e) => setEditing({ ...editing, remark: e.target.value })} />
            </Field>
          </>
        )}
      </Modal>
    </div>
  );
}
