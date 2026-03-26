'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface AreaTimelineChartProps {
  data: Record<string, unknown>[];
  dataKeys: Array<{ key: string; color: string; name: string }>;
  xKey?: string;
  height?: number;
  xFormatter?: (value: string) => string;
}

export function AreaTimelineChart({
  data,
  dataKeys,
  xKey = 'bucket',
  height = 300,
  xFormatter,
}: AreaTimelineChartProps) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11 }}
            tickFormatter={xFormatter}
          />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
          />
          {dataKeys.map((dk) => (
            <Area
              key={dk.key}
              type="monotone"
              dataKey={dk.key}
              stroke={dk.color}
              fill={dk.color}
              fillOpacity={0.1}
              name={dk.name}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
