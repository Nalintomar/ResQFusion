const BASE = '/api';

function tokenHeader() {
  const t = localStorage.getItem('resqfusion_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? tokenHeader() : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  register: (payload) => request('/auth/register', { method: 'POST', body: payload, auth: false }),

  health: () => request('/health', { auth: false }),
  summary: () => request('/dashboard/summary'),
  hotspots: () => request('/dashboard/hotspots'),
  posts: (params = '') => request(`/dashboard/posts${params}`),
  alerts: (params = '') => request(`/dashboard/alerts${params}`),
  allocation: () => request('/dashboard/allocation'),
  history: (params = '') => request(`/dashboard/history${params}`),
  mlMetrics: () => request('/dashboard/ml-metrics'),
  regions: () => request('/dashboard/regions'),
  resources: () => request('/resources'),
  resourcesSummary: () => request('/resources/summary'),
  runPipeline: () => request('/pipeline/run', { method: 'POST' }),

  citizenReport: (payload) => request('/citizen/report', { method: 'POST', body: payload, auth: false }),
  citizenAlerts: (params = '') => request(`/citizen/alerts${params}`, { auth: false }),
  myReports: () => request('/citizen/my-reports'),
};

export function saveSession(token, user) {
  localStorage.setItem('resqfusion_token', token);
  localStorage.setItem('resqfusion_user', JSON.stringify(user));
}
export function loadSession() {
  const token = localStorage.getItem('resqfusion_token');
  const user = localStorage.getItem('resqfusion_user');
  return token && user ? { token, user: JSON.parse(user) } : null;
}
export function clearSession() {
  localStorage.removeItem('resqfusion_token');
  localStorage.removeItem('resqfusion_user');
}
