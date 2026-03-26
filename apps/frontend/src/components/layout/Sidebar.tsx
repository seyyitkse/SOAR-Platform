'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Shield, ChevronLeft, ChevronRight } from 'lucide-react';
import { RolePermissions } from '@/lib/store';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  permission?: keyof RolePermissions;
}

interface SidebarProps {
  items: NavItem[];
  permissions: RolePermissions;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ items, permissions, collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  const filteredItems = items.filter((item) => {
    if (!item.permission) return true;
    return permissions[item.permission];
  });

  return (
    <aside className={cn('flex flex-col border-r border-border bg-card transition-all duration-200', collapsed ? 'w-16' : 'w-64')}>
      <div className="flex items-center gap-3 px-4 h-16 border-b border-border">
        <Shield className="w-7 h-7 text-blue-500 shrink-0" />
        {!collapsed && <span className="font-bold text-lg truncate">SOAR Platform</span>}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {filteredItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition text-sm font-medium',
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                collapsed && 'justify-center',
              )}
              title={collapsed ? item.label : undefined}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={onToggle}
        className="flex items-center justify-center h-10 border-t border-border text-muted-foreground hover:text-foreground transition"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
}
