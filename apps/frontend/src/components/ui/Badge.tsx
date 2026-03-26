'use client';

import { cn } from '@/lib/utils';

const severityColors: Record<string, string> = {
  low: 'bg-blue-500/20 text-blue-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  high: 'bg-orange-500/20 text-orange-400',
  critical: 'bg-red-500/20 text-red-400',
};

const variantColors: Record<string, string> = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-green-500/20 text-green-400',
  warning: 'bg-yellow-500/20 text-yellow-400',
  danger: 'bg-red-500/20 text-red-400',
  info: 'bg-blue-500/20 text-blue-400',
  muted: 'bg-muted text-muted-foreground',
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: keyof typeof variantColors;
  severity?: number;
  className?: string;
}

export function Badge({ children, variant = 'default', severity, className }: BadgeProps) {
  let colorClass = variantColors[variant];

  if (severity !== undefined) {
    if (severity >= 9) colorClass = severityColors.critical;
    else if (severity >= 7) colorClass = severityColors.high;
    else if (severity >= 4) colorClass = severityColors.medium;
    else colorClass = severityColors.low;
  }

  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', colorClass, className)}>
      {children}
    </span>
  );
}
