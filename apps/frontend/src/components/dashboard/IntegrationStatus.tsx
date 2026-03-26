'use client';

import { cn } from '@/lib/utils';
import { StatusDot } from '@/components/ui/StatusDot';

interface IntegrationStatusProps {
  name: string;
  status: 'active' | 'error' | 'disabled' | 'syncing';
  lastSync: string | null;
  className?: string;
}

const statusMap: Record<string, 'online' | 'offline' | 'warning' | 'syncing'> = {
  active: 'online',
  error: 'offline',
  disabled: 'warning',
  syncing: 'syncing',
};

export function IntegrationStatusCard({ name, status, lastSync, className }: IntegrationStatusProps) {
  return (
    <div className={cn('flex items-center justify-between p-3 rounded-lg bg-accent/50', className)}>
      <div className="flex items-center gap-3">
        <StatusDot status={statusMap[status] || 'offline'} />
        <span className="font-medium text-sm">{name}</span>
      </div>
      <span className="text-xs text-muted-foreground">
        {lastSync
          ? `Son sync: ${new Date(lastSync).toLocaleString('tr-TR')}`
          : 'Henuz senkronize edilmedi'}
      </span>
    </div>
  );
}
