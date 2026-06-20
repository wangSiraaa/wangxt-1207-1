import { NavLink } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';

const ROLES = [
  { key: 'lab', label: '实验室' },
  { key: 'officer', label: '学院安全员' },
  { key: 'disposal', label: '处置单位' },
];

const NAV = [
  { to: '/', label: '看板' },
  { to: '/declare', label: '申报' },
  { to: '/store', label: '暂存' },
  { to: '/transfer', label: '转运' },
  { to: '/weigh', label: '称重' },
];

export default function Layout({ children }) {
  const { role, setRole, toasts, dismissToast } = useApp();
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">⚗️</span>
          <div className="brand-text">
            <h1>危化废液暂存转运系统</h1>
            <p>实验室 · 学院安全员 · 处置单位 协同处理</p>
          </div>
        </div>
        <div className="role-switch" role="tablist" aria-label="当前角色">
          <span className="role-label">当前角色</span>
          {ROLES.map((r) => (
            <button
              key={r.key}
              className={role === r.key ? 'active' : ''}
              onClick={() => setRole(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>
      <nav className="navtabs">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="content">{children}</main>
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => dismissToast(t.id)}>
            <span className="toast-msg">{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
