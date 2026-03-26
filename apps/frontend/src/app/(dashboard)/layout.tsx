'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore, RoleName, RolePermissions, useWebSocketStore } from '@/lib/store';
import {
  Shield,
  BarChart3,
  Activity,
  Search,
  Server,
  FileText,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  Moon,
  Sun,
  ClipboardList,
} from 'lucide-react';
import { useTheme } from 'next-themes';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  permission?: keyof RolePermissions;
}

const navItems: NavItem[] = [
  { label: 'Yonetici Paneli', href: '/executive', icon: <BarChart3 className="w-5 h-5" />, permission: 'view_executive_dashboard' },
  { label: 'Operasyon Paneli', href: '/analyst', icon: <Activity className="w-5 h-5" />, permission: 'view_analyst_dashboard' },
  { label: 'VirusTotal', href: '/virustotal', icon: <Search className="w-5 h-5" />, permission: 'trigger_virustotal' },
  { label: 'Sistem Metrikleri', href: '/systems', icon: <Server className="w-5 h-5" />, permission: 'view_system_metrics' },
  { label: 'Raporlar', href: '/reports', icon: <FileText className="w-5 h-5" />, permission: 'view_reports' },
  { label: 'Denetim Loglari', href: '/audit', icon: <ClipboardList className="w-5 h-5" />, permission: 'view_audit_logs' },
  { label: 'Ayarlar', href: '/settings', icon: <Settings className="w-5 h-5" /> },
];

const roleBadgeColors: Record<RoleName, string> = {
  super_admin: 'bg-purple-500/20 text-purple-400',
  admin: 'bg-blue-500/20 text-blue-400',
  analyst: 'bg-green-500/20 text-green-400',
  c_level: 'bg-amber-500/20 text-amber-400',
};

const roleLabels: Record<RoleName, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  analyst: 'Analist',
  c_level: 'C-Level',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, clearAuth, accessToken } = useAuthStore();
  const { connected, setConnected, addMessage } = useWebSocketStore();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!user || !accessToken) {
      router.push('/login');
    }
  }, [user, accessToken, router]);

  // WebSocket connection
  useEffect(() => {
    if (!accessToken) return;

    const wsUrl = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001') + `/ws?token=${accessToken}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        addMessage({ event: msg.event, data: msg.data, receivedAt: new Date().toISOString() });
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [accessToken, setConnected, addMessage]);

  if (!user) return null;

  const filteredNav = navItems.filter((item) => {
    if (!item.permission) return true;
    return user.permissions[item.permission];
  });

  const handleLogout = () => {
    clearAuth();
    router.push('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border bg-card transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-border">
          <Shield className="w-7 h-7 text-blue-500 shrink-0" />
          {!collapsed && <span className="font-bold text-lg truncate">SOAR Platform</span>}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {filteredNav.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm font-medium ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                } ${collapsed ? 'justify-center' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                {item.icon}
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center h-10 border-t border-border text-muted-foreground hover:text-foreground transition"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between h-16 px-6 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
            <span className="text-xs text-muted-foreground">
              {connected ? 'Canli baglanti' : 'Baglanti yok'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Theme toggle */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notifications indicator */}
            <button className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition relative">
              <Bell className="w-4 h-4" />
            </button>

            {/* User info */}
            <div className="flex items-center gap-3 pl-4 border-l border-border">
              <div className="text-right">
                <p className="text-sm font-medium">{user.username}</p>
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${roleBadgeColors[user.role]}`}>
                  {roleLabels[user.role]}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                title="Cikis Yap"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
