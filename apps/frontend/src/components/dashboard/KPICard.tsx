'use client';

import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  className?: string;
}

export function KPICard({ label, value, icon, color, bgColor, trend, trendValue, className }: KPICardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-5 flex items-start gap-4', className)}>
      <div className={cn('p-3 rounded-lg', bgColor, color)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {trend && (
          <div className="flex items-center gap-1 mt-1">
            {trend === 'up' && <TrendingUp className="w-3 h-3 text-red-400" />}
            {trend === 'down' && <TrendingDown className="w-3 h-3 text-green-400" />}
            {trend === 'stable' && <Minus className="w-3 h-3 text-slate-400" />}
            {trendValue && <span className="text-xs text-muted-foreground">{trendValue}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
