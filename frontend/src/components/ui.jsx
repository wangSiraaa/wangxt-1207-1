export const STATUS = {
  pending: { label: '待暂存', cls: 'st-pending' },
  stored: { label: '已暂存', cls: 'st-stored' },
  transferring: { label: '转运中', cls: 'st-transfer' },
  weighed: { label: '已称重', cls: 'st-weighed' },
};

export const INCOMPATIBLE_PAIRS = [
  ['acid', 'base'],
  ['oxidizer', 'reducer'],
];

export function isIncompatible(a, b) {
  if (!a || !b) return false;
  if (a === b) return false;
  return INCOMPATIBLE_PAIRS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a)
  );
}

export function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, cls: '' };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export function Field({ label, children, hint, required }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required ? <em>*</em> : null}
      </span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function EmptyState({ icon = '📭', title, hint }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {hint ? <div className="empty-hint">{hint}</div> : null}
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer, wide }) {
  if (!open) return null;
  return (
    <div className="modal-mask" onClick={onClose}>
      <div
        className={`modal ${wide ? 'wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Loader() {
  return <div className="loader">加载中…</div>;
}
