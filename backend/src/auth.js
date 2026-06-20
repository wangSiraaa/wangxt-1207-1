const ROLES = {
  lab: '实验室',
  officer: '学院安全员',
  disposal: '处置单位',
};

const VALID_ROLES = Object.keys(ROLES);

function resolveRole(req) {
  const headerRole = (req.get('X-Role') || '').trim();
  if (VALID_ROLES.includes(headerRole)) return headerRole;
  const bodyRole = (req.body && req.body._role) || (req.query && req.query._role);
  if (VALID_ROLES.includes(bodyRole)) return bodyRole;
  return null;
}

function attachRole(req, res, next) {
  req.role = resolveRole(req);
  next();
}

function requireRole(allowedRoles, opDesc) {
  const arr = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return (req, res, next) => {
    if (!req.role) {
      return res.status(401).json({
        error: '身份未识别：请通过 X-Role 请求头或 _role 参数声明角色',
        allowed: arr.map((r) => ROLES[r] || r).join(' / '),
      });
    }
    if (!arr.includes(req.role)) {
      const need = arr.map((r) => ROLES[r] || r).join(' 或 ');
      const cur = ROLES[req.role] || req.role;
      const hint = opDesc ? `（${opDesc}）` : '';
      return res.status(403).json({
        error: `权限不足：当前角色为「${cur}」，无权限执行该操作${hint}，需要「${need}」角色。`,
        need_roles: arr,
        current_role: req.role,
      });
    }
    next();
  };
}

module.exports = {
  ROLES,
  VALID_ROLES,
  resolveRole,
  attachRole,
  requireRole,
};
