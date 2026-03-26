'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { eventsApi, metricsApi, integrationsApi } from '@/lib/api';
import { useAuthStore, useWebSocketStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import {
  ShieldAlert,
  ShieldCheck,
  Server,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';

interface KPIData {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

export default function ExecutivePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const messages = useWebSocketStore((s) => s.messages);
  const [kpiRefreshKey, setKpiRefreshKey] = useState(0);

  // Permission check
  useEffect(() => {
    if (user && !user.permissions.view_executive_dashboard) {
      router.push('/analyst');
    }
  }, [user, router]);

  // Refresh KPIs when new_event arrives via WebSocket
  useEffect(() => {
    const lastMsg = messages[0];
    if (lastMsg?.event === 'new_event') {
      setKpiRefreshKey((k) => k + 1);
    }
  }, [messages]);

  // Stats query
  const { data: statsData } = useQuery({
    queryKey: ['event-stats', kpiRefreshKey],
    queryFn: () => eventsApi.getEventStats(),
    refetchInterval: 60_000,
  });

  // Timeline query
  const { data: timelineData } = useQuery({
    queryKey: ['event-timeline-executive'],
    queryFn: () => eventsApi.getTimeline({ interval: '1h', from: new Date(Date.now() - 7 * 86400000).toISOString() }),
    refetchInterval: 60_000,
  });

  // Integrations
  const { data: integrationsData } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => integrationsApi.getIntegrations(),
    refetchInterval: 60_000,
  });

  // Uptime
  const { data: uptimeData } = useQuery({
    queryKey: ['uptime'],
    queryFn: () => metricsApi.getUptime(),
    refetchInterval: 60_000,
  });

  // Critical events
  const { data: criticalEventsData } = useQuery({
    queryKey: ['critical-events', kpiRefreshKey],
    queryFn: () => eventsApi.getEvents({ severity_min: 7, limit: 5, sort_by: 'time', sort_order: 'desc' }),
    refetchInterval: 60_000,
  });

  const stats = statsData?.data?.data;
  const timeline = timelineData?.data?.data || [];
  const integrations = integrationsData?.data?.data || [];
  const uptimeList = uptimeData?.data?.data || [];
  const criticalEvents = criticalEventsData?.data?.data || [];

  const kpiCards: KPIData[] = [
    {
      label: 'Bugunku Toplam Tehdit',
      value: stats?.total_today ?? '-',
      icon: <ShieldAlert className="w-6 h-6" />,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
    },
    {
      label: 'Engellenen Saldiri',
      value: stats?.blocked_today ?? '-',
      icon: <ShieldCheck className="w-6 h-6" />,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: 'Sistem Uptime',
      value: stats?.overall_uptime ? `${stats.overall_uptime}%` : '-',
      icon: <Server className="w-6 h-6" />,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
    {
      label: 'Kritik Acik Olay',
      value: stats?.critical_unresolved ?? '-',
      icon: <AlertTriangle className="w-6 h-6" />,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
    },
  ];

  const trendIcon = stats?.trend === 'improving'
    ? <TrendingDown className="w-4 h-4 text-green-400" />
    : stats?.trend === 'worsening'
      ? <TrendingUp className="w-4 h-4 text-red-400" />
      : <Minus className="w-4 h-4 text-slate-400" />;

  const severityColor = (severity: number) => {
    if (severity >= 9) return 'bg-red-500/20 text-red-400';
    if (severity >= 7) return 'bg-orange-500/20 text-orange-400';
    if (severity >= 4) return 'bg-yellow-500/20 text-yellow-400';
    return 'bg-blue-500/20 text-blue-400';
  };

  const integrationStatusColor = (status: string) => {
    if (status === 'active') return 'bg-green-500';
    if (status === 'error') return 'bg-red-500';
    if (status === 'syncing') return 'bg-blue-500 animate-pulse';
    return 'bg-slate-500';
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Yonetici Paneli</h1>
          <p className="text-muted-foreground text-sm mt-1">Guvenlik durumu ozeti ve kritik metrikler</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {trendIcon}
          <span>{stats?.trend === 'improving' ? 'Iyilesiyor' : stats?.trend === 'worsening' ? 'Kotulesme' : 'Stabil'}</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-border bg-card p-5 flex items-start gap-4"
          >
            <div className={`p-3 rounded-lg ${kpi.bgColor} ${kpi.color}`}>
              {kpi.icon}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{kpi.label}</p>
              <p className="text-2xl font-bold mt-1">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Trend Chart */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Tehdit Trendi (Son 7 Gun)</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="bucket"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => {
                  const d = new Date(v);
                  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`;
                }}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Area type="monotone" dataKey="total" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} name="Toplam" />
              <Area type="monotone" dataKey="critical" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} name="Kritik" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Integration Status */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Entegrasyon Durumu</h2>
          <div className="space-y-3">
            {integrations.map((int: { id: string; display_name: string; status: string; last_sync_at: string | null }) => (
              <div key={int.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/50">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${integrationStatusColor(int.status)}`} />
                  <span className="font-medium text-sm">{int.display_name}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {int.last_sync_at
                    ? `Son sync: ${new Date(int.last_sync_at).toLocaleString('tr-TR')}`
                    : 'Henuz senkronize edilmedi'}
                </span>
              </div>
            ))}
            {integrations.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Entegrasyon bulunamadi</p>
            )}
          </div>
        </div>

        {/* Critical Events */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Son 5 Kritik Olay</h2>
          <div className="space-y-2">
            {criticalEvents.map((evt: { id: string; time: string; source_host: string | null; event_type: string; severity: number }) => (
              <div key={evt.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityColor(evt.severity)}`}>
                      {evt.severity}
                    </span>
                    <span className="text-sm font-medium truncate">{evt.event_type}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{evt.source_host || 'Bilinmeyen kaynak'}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 ml-3">
                  {new Date(evt.time).toLocaleString('tr-TR')}
                </span>
              </div>
            ))}
            {criticalEvents.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Kritik olay yok</p>
            )}
          </div>
        </div>
      </div>

      {/* Uptime Bar Chart */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Sistem Uptime Ozeti</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={uptimeList} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <YAxis type="category" dataKey="host_name" tick={{ fontSize: 11 }} width={120} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => [`${value.toFixed(2)}%`, 'Uptime']}
              />
              <Bar dataKey="uptime_24h" name="Son 24s Uptime" radius={[0, 4, 4, 0]}>
                {uptimeList.map((_: unknown, index: number) => {
                  const val = (uptimeList[index] as { uptime_24h?: number })?.uptime_24h ?? 0;
                  let color = '#22c55e';
                  if (val < 99) color = '#ef4444';
                  else if (val < 99.9) color = '#eab308';
                  return <Cell key={index} fill={color} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
