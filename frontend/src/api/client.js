const BASE = '/api';

let _currentRole = 'lab';

export function setRequestRole(role) {
  _currentRole = role || 'lab';
}

export function getRequestRole() {
  return _currentRole;
}

async function request(path, options = {}) {
  let res;
  const headers = {
    'Content-Type': 'application/json',
    'X-Role': _currentRole,
    ...(options.headers || {}),
  };
  try {
    res = await fetch(BASE + path, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (e) {
    throw new Error('网络异常：无法连接服务端（' + e.message + '）');
  }
  let data;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    throw new Error(data.error || `请求失败（HTTP ${res.status}）`);
  }
  return data;
}

export const api = {
  getCategories: () => request('/categories'),
  getCabinets: () => request('/cabinets'),
  getDeclarations: (status) =>
    request('/declarations' + (status ? `?status=${status}` : '')),
  getDeclaration: (id) => request(`/declarations/${id}`),
  createDeclaration: (d) => request('/declarations', { method: 'POST', body: d }),
  updateDeclaration: (id, d) =>
    request(`/declarations/${id}`, { method: 'PATCH', body: d }),
  deleteDeclaration: (id) => request(`/declarations/${id}`, { method: 'DELETE' }),
  storeDeclaration: (id, cabinet_id) =>
    request(`/declarations/${id}/store`, { method: 'POST', body: { cabinet_id } }),
  unstoreDeclaration: (id) =>
    request(`/declarations/${id}/unstore`, { method: 'POST' }),
  transferDeclaration: (id, d) =>
    request(`/declarations/${id}/transfer`, { method: 'POST', body: d }),
  weighDeclaration: (id, weight) =>
    request(`/declarations/${id}/weigh`, { method: 'POST', body: { weight } }),
  getTransfers: () => request('/transfers'),
  getDashboard: async () => {
    const [decls, cabs, cats, trs] = await Promise.all([
      request('/declarations'),
      request('/cabinets'),
      request('/categories'),
      request('/transfers'),
    ]);
    return { decls, cabs, cats, trs };
  },
};
