'use client';

import { cn } from '@/lib/utils';

interface SeverityBadgeProps {
  severity: number;
  className?: string;
}

const severityConfig: Record<string, { label: string; color: string }> = {
  critical: { label: 'Kritik', color: 'bg-red-500/20 text-red-400' },
  high: { label: 'Yuksek', color: 'bg-orange-500/20 text-orange-400' },
  medium: { label: 'Orta', color: 'bg-yellow-500/20 text-yellow-400' },
  low: { label: 'Dusuk', color: 'bg-blue-500/20 text-blue-400' },
};

function getSeverityLevel(severity: number) {
  if (severity >= 9) return severityConfig.critical;
  if (severity >= 7) return severityConfig.high;
  if (severity >= 4) return severityConfig.medium;
  return severityConfig.low;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const config = getSeverityLevel(severity);
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', config.color, className)}>
      {severity} <span className="opacity-70">{config.label}</span>
    </span>
  );
}
