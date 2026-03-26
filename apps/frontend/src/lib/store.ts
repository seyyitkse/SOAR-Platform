import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoleName = 'super_admin' | 'admin' | 'analyst' | 'c_level';

export interface RolePermissions {
  view_executive_dashboard: boolean;
  view_analyst_dashboard: boolean;
  view_security_events: boolean;
  view_system_metrics: boolean;
  manage_integrations: boolean;
  manage_users: boolean;
  manage_api_keys: boolean;
  trigger_virustotal: boolean;
  view_reports: boolean;
  generate_reports: boolean;
  manage_alert_rules: boolean;
  view_audit_logs: boolean;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: RoleName;
  permissions: RolePermissions;
}

// ─── Auth Store ───────────────────────────────────────────────────────────────

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,

  setAuth: (user, accessToken, refreshToken) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
    }
    set({ user, accessToken, refreshToken });
  },

  clearAuth: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
    set({ user: null, accessToken: null, refreshToken: null });
  },

  hydrate: () => {
    if (typeof window === 'undefined') return;
    try {
      const accessToken = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken');
      const userStr = localStorage.getItem('user');
      if (accessToken && refreshToken && userStr) {
        const user = JSON.parse(userStr) as AuthUser;
        set({ user, accessToken, refreshToken });
      }
    } catch {
      // corrupted localStorage — clear it
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
  },
}));

// ─── WebSocket Store ──────────────────────────────────────────────────────────

interface WSMessage {
  event: string;
  data: unknown;
  receivedAt: string;
}

interface WebSocketState {
  connected: boolean;
  messages: WSMessage[];
  setConnected: (connected: boolean) => void;
  addMessage: (msg: WSMessage) => void;
  clearMessages: () => void;
}

export const useWebSocketStore = create<WebSocketState>((set) => ({
  connected: false,
  messages: [],

  setConnected: (connected) => set({ connected }),

  addMessage: (msg) =>
    set((state) => ({
      messages: [msg, ...state.messages].slice(0, 200), // keep last 200
    })),

  clearMessages: () => set({ messages: [] }),
}));
