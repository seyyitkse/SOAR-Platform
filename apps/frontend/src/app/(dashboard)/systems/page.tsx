'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { metricsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import {
  Server,
  Cpu,
  HardDrive,
  MemoryStick,
  X,
  Clock,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

const TIME_OPTIONS = [
  { label: 'Son 1s', hours: 1, interval: '5m' },
  { label: 'Son 6s', hours: 6, interval: '15m' },
  { label: 'Son 24s', hours: 24, interval: '1h' },
  { label: 'Son 7g', hours: 168, interval: '6h' },
];

interface Host {
  hostid: string;
  host: string;
  name: string;
  status: number;
}

interface MetricSummary {
  host_id: string;
  host_name: string;
  metrics: Record<string, { value: number; unit: string; time: string }>;
}

interface UptimeEntry {
  host_id: string;
  host_name: string;
  uptime_24h: number;
  uptime_7d: number;
  uptime_30d: number;
}

export default function SystemsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [selectedHost, setSelectedHost] = useState<string | null>(null);
  const [selectedHostName, setSelectedHostName] = useState('');
  const [timeRange, setTimeRange] = useState(TIME_OPTIONS[2]);
  const [selectedMetric, setSelectedMetric] = useState('cpu_usage');

  // Permission check
  useEffect(() => {
    if (user && !user.permissions.view_system_metrics) {
      router.push('/analyst');
    }
  }, [user, router]);

  // Hosts
  const { data: hostsData } = useQuery({
    queryKey: ['metric-hosts'],
    queryFn: () => metricsApi.getHosts(),
    refetchInterval: 60_000,
  });

  // Summary
  const { data: summaryData } = useQuery({
    queryKey: ['metric-summary'],
    queryFn: () => metricsApi.getSummary(),
    refetchInterval: 30_000,
  });

  // Uptime
  const { data: uptimeData } = useQuery({
    queryKey: ['metric-uptime'],
    queryFn: () => metricsApi.getUptime(),
    refetchInterval: 60_000,
  });

  // Host timeline
  const { data: timelineData } = useQuery({
    queryKey: ['host-timeline', selectedHost, selectedMetric, timeRange.hours],
    queryFn: () =>
      metricsApi.getHostTimeline(selectedHost!, {
        metric: selectedMetric,
        from: new Date(Date.now() - timeRange.hours * 3600000).toISOString(),
        interval: timeRange.interval,
      }),
    enabled: !!selectedHost,
    refetchInterval: 30_000,
  });

  const hosts: Host[] = hostsData?.data?.data || [];
  const summaries: MetricSummary[] = summaryData?.data?.data || [];
  const uptimeList: UptimeEntry[] = uptimeData?.data?.data || [];
  const timeline = timelineData?.data?.data || [];

  const getMetricValue = (hostId: string, metric: string): number | null => {
    const host = summaries.find((s) => s.host_id === hostId);
    if (!host?.metrics?.[metric]) return null;
    return host.metrics[metric].value;
  };

  const progressColor = (value: number) => {
    if (value >= 90) return 'bg-red-500';
    if (value >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const slaColor = (uptime: number) => {
    if (uptime >= 99.9) return 'bg-green-500/20 text-green-400';
    if (uptime >= 99) return 'bg-yellow-500/20 text-yellow-400';
    return 'bg-red-500/20 text-red-400';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sistem Metrikleri</h1>
        <p className="text-muted-foreground text-sm mt-1">Zabbix uzerinden izlenen sistemlerin performans verileri</p>
      </div>

      {/* Host Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {hosts.map((host) => {
          const cpu = getMetricValue(host.hostid, 'cpu_usage');
          const ram = getMetricValue(host.hostid, 'memory_used_percent');
          const disk = getMetricValue(host.hostid, 'disk_used_percent');
          const isOnline = host.status === 0;

          return (
            <div
              key={host.hostid}
              onClick={() => {
                setSelectedHost(host.hostid);
                setSelectedHostName(host.name || host.host);
              }}
              className="rounded-xl border border-border bg-card p-5 hover:border-primary/50 cursor-pointer transition"
            >
              <div className="flex items-center gap-3 mb-4">
                <Server className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{host.name || host.host}</p>
                </div>
                <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'} ${isOnline ? 'animate-pulse' : ''}`} />
              </div>

              <div className="space-y-3">
                {/* CPU */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground flex items-center gap-1"><Cpu className="w-3 h-3" /> CPU</span>
                    <span className="font-medium">{cpu !== null ? `${cpu.toFixed(1)}%` : '-'}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${cpu !== null ? progressColor(cpu) : 'bg-muted'}`} style={{ width: `${cpu ?? 0}%` }} />
                  </div>
                </div>

                {/* RAM */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground flex items-center gap-1"><MemoryStick className="w-3 h-3" /> RAM</span>
                    <span className="font-medium">{ram !== null ? `${ram.toFixed(1)}%` : '-'}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${ram !== null ? progressColor(ram) : 'bg-muted'}`} style={{ width: `${ram ?? 0}%` }} />
                  </div>
                </div>

                {/* Disk */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground flex items-center gap-1"><HardDrive className="w-3 h-3" /> Disk</span>
                    <span className="font-medium">{disk !== null ? `${disk.toFixed(1)}%` : '-'}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${disk !== null ? progressColor(disk) : 'bg-muted'}`} style={{ width: `${disk ?? 0}%` }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {hosts.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            Henuz host verisi yok
          </div>
        )}
      </div>

      {/* Host Detail Modal */}
      {selectedHost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedHost(null)} />
          <div className="relative w-full max-w-4xl bg-card border border-border rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">{selectedHostName} - Detay</h2>
              <button onClick={() => setSelectedHost(null)} className="p-1 rounded hover:bg-accent transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex gap-1">
                {TIME_OPTIONS.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => setTimeRange(t)}
                    className={`px-3 py-1.5 text-xs rounded-lg transition ${
                      timeRange.label === t.label ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <select
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value)}
                className="px-3 py-1.5 bg-background border border-border rounded-lg text-xs"
              >
                <option value="cpu_usage">CPU Kullanimi</option>
                <option value="memory_used_percent">RAM Kullanimi</option>
                <option value="disk_used_percent">Disk Kullanimi</option>
                <option value="net_in_bytes">Network In</option>
                <option value="net_out_bytes">Network Out</option>
              </select>
            </div>

            {/* Chart */}
            <div className="h-72 mb-6">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: string) => {
                      const d = new Date(v);
                      return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
                    }}
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  {selectedMetric.includes('percent') || selectedMetric === 'cpu_usage' ? (
                    <ReferenceLine y={90} stroke="#ef4444" strokeDasharray="3 3" label="Kritik" />
                  ) : null}
                  <Line type="monotone" dataKey="avg_value" stroke="#3b82f6" strokeWidth={2} dot={false} name="Ortalama" />
                  <Line type="monotone" dataKey="max_value" stroke="#ef4444" strokeWidth={1} dot={false} name="Maks" strokeDasharray="3 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Uptime Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Uptime Durumu
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Host</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Son 24 Saat</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Son 7 Gun</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Son 30 Gun</th>
              </tr>
            </thead>
            <tbody>
              {uptimeList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-muted-foreground">Uptime verisi yok</td>
                </tr>
              ) : (
                uptimeList.map((entry) => (
                  <tr key={entry.host_id} className="border-b border-border">
                    <td className="px-4 py-3 font-medium">{entry.host_name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${slaColor(entry.uptime_24h)}`}>
                        {entry.uptime_24h.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${slaColor(entry.uptime_7d)}`}>
                        {entry.uptime_7d.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${slaColor(entry.uptime_30d)}`}>
                        {entry.uptime_30d.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
