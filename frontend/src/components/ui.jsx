export const STATUS = {
  pending: { label: '待暂存', cls: 'st-pending' },
  stored: { label: '已暂存', cls: 'st-stored' },
  transferring: { label: '转运中', cls: 'st-transfer' },
  weighed: { label: '已称重', cls: 'st-weighed' },
  review_pending: { label: '待复核', cls: 'st-review' },
};

export const REVIEW_STATUS = {
  pending: { label: '待复核', cls: 'st-review' },
  approved: { label: '复核通过', cls: 'st-weighed' },
  rejected: { label: '复核驳回', cls: 'st-pending' },
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

export function ReviewStatusBadge({ status }) {
  const s = REVIEW_STATUS[status] || { label: status, cls: '' };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export function HazardBadge({ h, small }) {
  if (!h) return null;
  const cls = small ? 'hz hz-sm' : 'hz';
  return (
    <span className={cls} title={h.label}>
      <span className="hz-sym">{h.symbol}</span>
      <span className="hz-lbl">{h.label}</span>
    </span>
  );
}

export function HazardTags({ list, small }) {
  if (!list || list.length === 0) return <span className="muted">—</span>;
  return (
    <div className="hz-row">
      {list.map((h) => (
        <HazardBadge key={h.code} h={h} small={small} />
      ))}
    </div>
  );
}

export function WeightDiffBar({ diff, declare_weight, weight }) {
  if (!diff) return null;
  const pct = Math.min(100, diff.diff_percent);
  const warn = diff.needs_review;
  return (
    <div className={`wdiff ${warn ? 'warn' : ''}`}>
      <div className="wdiff-row">
        <span className="wdiff-k">申报</span>
        <span className="wdiff-v">{declare_weight} kg</span>
        <span className="wdiff-k">实际</span>
        <span className="wdiff-v">{weight} kg</span>
        <span className="wdiff-k">差异</span>
        <span className={`wdiff-v ${warn ? 'warn-text' : ''}`}>
          ±{diff.diff_weight} kg（{diff.diff_percent}%）
        </span>
      </div>
      <div className="wdiff-bar">
        <i
          style={{ width: `${pct}%` }}
          className={warn ? 'danger' : 'ok'}
        />
        <span
          className="threshold"
          style={{ left: `${diff.threshold || 20}%` }}
          title={`阈值 ${diff.threshold || 20}%`}
        >
          ▲ {diff.threshold || 20}%
        </span>
      </div>
      {warn && (
        <div className="wdiff-alert">
          ⚠️ 差异超过阈值，需复核确认
        </div>
      )}
    </div>
  );
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

export function CheckGroup({ options, values, onChange }) {
  const toggle = (code) => {
    const set = new Set(values || []);
    if (set.has(code)) set.delete(code);
    else set.add(code);
    onChange([...set]);
  };
  return (
    <div className="check-group">
      {options.map((o) => {
        const on = (values || []).includes(o.code);
        return (
          <label
            key={o.code}
            className={`chk ${on ? 'on' : ''}`}
            onClick={(e) => { e.preventDefault(); toggle(o.code); }}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => toggle(o.code)}
            />
            <span className="chk-sym">{o.symbol}</span>
            <span className="chk-lbl">{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}

export function StepFlow({ status }) {
  const steps = [
    { key: 'pending', label: '申报', icon: '📝' },
    { key: 'stored', label: '暂存', icon: '🗄️' },
    { key: 'transferring', label: '转运', icon: '🚚' },
    { key: 'weighed', label: '称重', icon: '⚖️' },
  ];
  const seq = ['pending', 'stored', 'transferring', 'weighed'];
  const idx = status === 'review_pending' ? 3 : seq.indexOf(status);
  return (
    <div className="stepflow">
      {steps.map((s, i) => {
        const done = i <= idx && idx >= 0;
        const active = i === idx;
        return (
          <div
            key={s.key}
            className={`step ${done ? 'done' : ''} ${active ? 'active' : ''}`}
          >
            <div className="step-ic">{s.icon}</div>
            <div className="step-lb">{s.label}</div>
            {i < steps.length - 1 ? <div className={`step-line ${i < idx ? 'done' : ''}`} /> : null}
          </div>
        );
      })}
      {status === 'review_pending' && (
        <div className="step review active">
          <div className="step-ic">🔍</div>
          <div className="step-lb">复核</div>
        </div>
      )}
    </div>
  );
}
