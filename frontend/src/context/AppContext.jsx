import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { setRequestRole } from '../api/client.js';

const Ctx = createContext(null);

const ROLE_DEFAULTS = {
  lab: { label: '实验室', submitter: '张实验（化学楼302）', transfer_unit: '', operator: '' },
  officer: { label: '学院安全员', submitter: '', transfer_unit: '', operator: '' },
  disposal: { label: '处置单位', submitter: '', transfer_unit: '绿源环保处置中心', operator: '李处置' },
};

export function AppProvider({ children }) {
  const [role, setRoleState] = useState('lab');
  const [toasts, setToasts] = useState([]);

  const setRole = useCallback((r) => {
    setRoleState(r);
    setRequestRole(r);
  }, []);

  useEffect(() => {
    setRequestRole(role);
  }, [role]);

  const pushToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const value = { role, setRole, roleInfo: ROLE_DEFAULTS, pushToast, dismissToast, toasts };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
