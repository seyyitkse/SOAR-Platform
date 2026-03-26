'use client';

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface BarChartProps {
  data: Record<string, unknown>[];
  dataKey: string;
  xKey: string;
  height?: number;
  layout?: 'horizontal' | 'vertical';
  color?: string;
  colorFn?: (value: unknown, index: number) => string;
}

export function BarChartComponent({
  data,
  dataKey,
  xKey,
  height = 300,
  layout = 'horizontal',
  color = '#3b82f6',
  colorFn,
}: BarChartProps) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart data={data} layout={layout}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          {layout === 'vertical' ? (
            <>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey={xKey} tick={{ fontSize: 11 }} width={120} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
            </>
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
          />
          <Bar dataKey={dataKey} radius={[4, 4, 0, 0]}>
            {colorFn
              ? data.map((entry, index) => <Cell key={index} fill={colorFn(entry, index)} />)
              : data.map((_, index) => <Cell key={index} fill={color} />)}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}
