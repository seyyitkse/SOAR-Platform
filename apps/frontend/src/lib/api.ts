import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// ─── Request Interceptor ──────────────────────────────────────────────────────

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// ─── Response Interceptor — 401 refresh logic ────────────────────────────────

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((prom) => {
    if (token) prom.resolve(token);
    else prom.reject(error);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken });

        const newAccess = data.data.accessToken;
        const newRefresh = data.data.refreshToken;

        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', newAccess);
          localStorage.setItem('refreshToken', newRefresh);
        }

        processQueue(null, newAccess);
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// ─── Auth API ─────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),

  logout: () =>
    api.post('/auth/logout'),

  refresh: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),

  getMe: () =>
    api.get('/auth/me'),
};

// ─── Events API ───────────────────────────────────────────────────────────────

export interface EventsParams {
  page?: number;
  limit?: number;
  severity_min?: number;
  severity_max?: number;
  integration?: string;
  event_type?: string;
  source_ip?: string;
  is_resolved?: boolean;
  search?: string;
  from?: string;
  to?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export const eventsApi = {
  getEvents: (params: EventsParams = {}) =>
    api.get('/events', { params }),

  getEvent: (id: string) =>
    api.get(`/events/${id}`),

  resolveEvent: (id: string, notes?: string) =>
    api.patch(`/events/${id}/resolve`, { notes }),

  getEventStats: () =>
    api.get('/events/stats'),

  getTimeline: (params: { interval?: string; from?: string; to?: string } = {}) =>
    api.get('/events/timeline', { params }),
};

// ─── Integrations API ─────────────────────────────────────────────────────────

export const integrationsApi = {
  getIntegrations: () =>
    api.get('/integrations'),

  getIntegration: (id: string) =>
    api.get(`/integrations/${id}`),

  updateIntegration: (id: string, data: Record<string, unknown>) =>
    api.put(`/integrations/${id}`, data),

  syncIntegration: (id: string) =>
    api.post(`/integrations/${id}/sync`),

  getApiKeys: (integrationId: string) =>
    api.get(`/integrations/${integrationId}/keys`),

  addApiKey: (integrationId: string, data: { key_name: string; key_value: string }) =>
    api.post(`/integrations/${integrationId}/keys`, data),

  deleteApiKey: (integrationId: string, keyId: string) =>
    api.delete(`/integrations/${integrationId}/keys/${keyId}`),
};

// ─── Metrics API ──────────────────────────────────────────────────────────────

export const metricsApi = {
  getHosts: () =>
    api.get('/metrics/hosts'),

  getHostTimeline: (hostId: string, params: { metric?: string; from?: string; to?: string; interval?: string } = {}) =>
    api.get(`/metrics/hosts/${hostId}/timeline`, { params }),

  getSummary: () =>
    api.get('/metrics/summary'),

  getUptime: () =>
    api.get('/metrics/uptime'),
};

// ─── VirusTotal API ───────────────────────────────────────────────────────────

export const virustotalApi = {
  scanHash: (hash: string) =>
    api.post('/virustotal/scan', { hash }),

  getScanResult: (hash: string) =>
    api.get(`/virustotal/result/${hash}`),

  getHistory: (params: { page?: number; limit?: number } = {}) =>
    api.get('/virustotal/history', { params }),

  deleteScan: (hash: string) =>
    api.delete(`/virustotal/${hash}`),
};

// ─── Reports API ──────────────────────────────────────────────────────────────

export const reportsApi = {
  getReports: (params: { page?: number; limit?: number } = {}) =>
    api.get('/reports', { params }),

  generateReport: (data: { type: string; targetRole: string }) =>
    api.post('/reports/generate', data),

  downloadReport: (id: string) =>
    api.get(`/reports/${id}/download`, { responseType: 'blob' }),

  deleteReport: (id: string) =>
    api.delete(`/reports/${id}`),
};

// ─── Users API ────────────────────────────────────────────────────────────────

export const usersApi = {
  getUsers: (params: { page?: number; limit?: number } = {}) =>
    api.get('/users', { params }),

  createUser: (data: { username: string; email: string; password: string; role_id: string }) =>
    api.post('/users', data),

  updateUser: (id: string, data: Record<string, unknown>) =>
    api.put(`/users/${id}`, data),

  deleteUser: (id: string) =>
    api.delete(`/users/${id}`),
};

// ─── Alert Rules API ──────────────────────────────────────────────────────────

export const alertRulesApi = {
  getRules: () =>
    api.get('/alert-rules'),

  createRule: (data: Record<string, unknown>) =>
    api.post('/alert-rules', data),

  updateRule: (id: string, data: Record<string, unknown>) =>
    api.put(`/alert-rules/${id}`, data),

  deleteRule: (id: string) =>
    api.delete(`/alert-rules/${id}`),

  toggleRule: (id: string) =>
    api.patch(`/alert-rules/${id}/toggle`),
};

// ─── Audit API ────────────────────────────────────────────────────────────────

export const auditApi = {
  getLogs: (params: { page?: number; limit?: number; user_id?: string; action?: string; from?: string; to?: string } = {}) =>
    api.get('/audit', { params }),
};

export default api;
