'use client';

import { cn } from '@/lib/utils';

interface GaugeChartProps {
  value: number;
  max?: number;
  label: string;
  unit?: string;
  className?: string;
}

export function GaugeChart({ value, max = 100, label, unit = '%', className }: GaugeChartProps) {
  const percentage = Math.min((value / max) * 100, 100);

  const getColor = (pct: number) => {
    if (pct >= 90) return 'text-red-500';
    if (pct >= 70) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getBarColor = (pct: number) => {
    if (pct >= 90) return 'bg-red-500';
    if (pct >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className={cn('text-center', className)}>
      <div className="relative w-full h-2 bg-muted rounded-full overflow-hidden mb-2">
        <div
          className={cn('h-full rounded-full transition-all duration-500', getBarColor(percentage))}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn('text-sm font-bold', getColor(percentage))}>
          {value.toFixed(1)}{unit}
        </span>
      </div>
    </div>
  );
}
