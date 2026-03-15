const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

  // A gateway or proxy failure can answer with an empty body or HTML, in which
  // case parsing must not mask the real status code with a JSON syntax error.
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const error = new Error((data && data.message) || `Request failed (${res.status})`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  if (data === null) {
    throw new Error('Received an unreadable response from the server');
  }
  return data;
}

function withQuery(path, params) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== '')
  ).toString();
  return query ? `${path}?${query}` : path;
}

export const api = {
  login: (username, password) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  getClinics: () => request('/api/auth/clinics'),

  verifyToken: () => request('/api/auth/verify'),

  getOutcomes: (params = {}) => request(withQuery('/api/outcomes', params)),

  createOutcome: (outcomeData) =>
    request('/api/outcomes', {
      method: 'POST',
      body: JSON.stringify(outcomeData),
    }),

  getStats: () => request('/api/outcomes/stats'),

  getTrends: (params = {}) => request(withQuery('/api/outcomes/trends', params)),

  getCohorts: () => request('/api/outcomes/cohorts'),

  getInsights: () => request('/api/outcomes/insights'),

  getMetrics: () => request('/api/outcomes/metrics'),
};
