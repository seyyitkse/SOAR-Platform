'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun, Bell, LogOut } from 'lucide-react';
import { RoleName } from '@/lib/store';

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

interface HeaderProps {
  username: string;
  role: RoleName;
  connected: boolean;
  onLogout: () => void;
}

export function Header({ username, role, connected, onLogout }: HeaderProps) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="flex items-center justify-between h-16 px-6 border-b border-border bg-card">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
        <span className="text-xs text-muted-foreground">
          {connected ? 'Canli baglanti' : 'Baglanti yok'}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition relative">
          <Bell className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 pl-4 border-l border-border">
          <div className="text-right">
            <p className="text-sm font-medium">{username}</p>
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${roleBadgeColors[role]}`}>
              {roleLabels[role]}
            </span>
          </div>
          <button
            onClick={onLogout}
            className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
            title="Cikis Yap"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
