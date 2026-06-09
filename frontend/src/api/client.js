// Lightweight fetch wrapper with JWT access/refresh handling.
// The backend service is mounted under the "/_/backend" route prefix by the
// hosting platform (see app.json); override with VITE_API_BASE_URL if needed.
const BASE = import.meta.env.VITE_API_BASE_URL || '/_/backend/api';

const store = {
  get accessToken() {
    return localStorage.getItem('accessToken');
  },
  set accessToken(v) {
    v ? localStorage.setItem('accessToken', v) : localStorage.removeItem('accessToken');
  },
  get refreshToken() {
    return localStorage.getItem('refreshToken');
  },
  set refreshToken(v) {
    v ? localStorage.setItem('refreshToken', v) : localStorage.removeItem('refreshToken');
  },
};

export function setTokens({ accessToken, refreshToken }) {
  if (accessToken !== undefined) store.accessToken = accessToken;
  if (refreshToken !== undefined) store.refreshToken = refreshToken;
}

export function clearTokens() {
  store.accessToken = null;
  store.refreshToken = null;
}

let refreshing = null;

async function doRefresh() {
  if (!store.refreshToken) throw new Error('No refresh token');
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: store.refreshToken }),
  });
  if (!res.ok) {
    clearTokens();
    throw new Error('Session expired');
  }
  const data = await res.json();
  setTokens(data);
  return data.accessToken;
}

export async function api(path, { method = 'GET', body, auth = true, _retried = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && store.accessToken) headers.Authorization = `Bearer ${store.accessToken}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Transparently refresh once on 401, then retry the original request
  if (res.status === 401 && auth && !_retried && store.refreshToken) {
    try {
      refreshing = refreshing || doRefresh();
      await refreshing;
      refreshing = null;
      return api(path, { method, body, auth, _retried: true });
    } catch {
      refreshing = null;
      clearTokens();
    }
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = data?.error?.details;
    throw err;
  }
  return data;
}
