'use client';

import { cn } from '@/lib/utils';

interface StatusDotProps {
  status: 'online' | 'offline' | 'warning' | 'syncing';
  className?: string;
  label?: string;
}

const colors = {
  online: 'bg-green-500',
  offline: 'bg-red-500',
  warning: 'bg-yellow-500',
  syncing: 'bg-blue-500',
};

export function StatusDot({ status, className, label }: StatusDotProps) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <div
        className={cn(
          'w-2.5 h-2.5 rounded-full',
          colors[status],
          (status === 'online' || status === 'syncing') && 'animate-pulse',
        )}
      />
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  );
}
