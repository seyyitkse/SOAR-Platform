'use client';

import { useEffect, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsApi, EventsParams } from '@/lib/api';
import { useAuthStore, useWebSocketStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  ExternalLink,
  Clock,
  Filter,
} from 'lucide-react';

const SEVERITY_RANGES = [
  { label: 'Dusuk (1-3)', min: 1, max: 3, color: 'bg-blue-500/20 text-blue-400' },
  { label: 'Orta (4-6)', min: 4, max: 6, color: 'bg-yellow-500/20 text-yellow-400' },
  { label: 'Yuksek (7-8)', min: 7, max: 8, color: 'bg-orange-500/20 text-orange-400' },
  { label: 'Kritik (9-10)', min: 9, max: 10, color: 'bg-red-500/20 text-red-400' },
];

const TIME_RANGES = [
  { label: 'Son 1s', hours: 1 },
  { label: 'Son 6s', hours: 6 },
  { label: 'Son 24s', hours: 24 },
  { label: 'Son 7g', hours: 168 },
  { label: 'Son 30g', hours: 720 },
];

export default function AnalystPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const messages = useWebSocketStore((s) => s.messages);
  const queryClient = useQueryClient();

  const [selectedEvent, setSelectedEvent] = useState<Record<string, unknown> | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');

  // Filters
  const [timeRange, setTimeRange] = useState(24);
  const [severityFilter, setSeverityFilter] = useState<{ min?: number; max?: number }>({});
  const [integration, setIntegration] = useState('');
  const [eventType, setEventType] = useState('');
  const [sourceIp, setSourceIp] = useState('');
  const [resolvedFilter, setResolvedFilter] = useState<'' | 'true' | 'false'>('');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  // Permission check
  useEffect(() => {
    if (user && !user.permissions.view_analyst_dashboard) {
      router.push('/executive');
    }
  }, [user, router]);

  // Build query params
  const buildParams = useCallback((): EventsParams => {
    const params: EventsParams = { page, limit, sort_by: 'time', sort_order: 'desc' };
    if (timeRange > 0) {
      params.from = new Date(Date.now() - timeRange * 3600000).toISOString();
    }
    if (severityFilter.min) params.severity_min = severityFilter.min;
    if (severityFilter.max) params.severity_max = severityFilter.max;
    if (integration) params.integration = integration;
    if (eventType) params.event_type = eventType;
    if (sourceIp) params.source_ip = sourceIp;
    if (resolvedFilter) params.is_resolved = resolvedFilter === 'true';
    if (searchText) params.search = searchText;
    return params;
  }, [page, limit, timeRange, severityFilter, integration, eventType, sourceIp, resolvedFilter, searchText]);

  // Events query
  const { data: eventsData, isLoading } = useQuery({
    queryKey: ['analyst-events', buildParams()],
    queryFn: () => eventsApi.getEvents(buildParams()),
    refetchInterval: 30_000,
  });

  // Stats query
  const { data: statsData } = useQuery({
    queryKey: ['analyst-stats'],
    queryFn: () => eventsApi.getEventStats(),
    refetchInterval: 60_000,
  });

  // Resolve mutation
  const resolveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => eventsApi.resolveEvent(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analyst-events'] });
      queryClient.invalidateQueries({ queryKey: ['analyst-stats'] });
      setSelectedEvent(null);
      setResolveNotes('');
    },
  });

  // WebSocket new events — refresh
  useEffect(() => {
    const lastMsg = messages[0];
    if (lastMsg?.event === 'new_event') {
      queryClient.invalidateQueries({ queryKey: ['analyst-events'] });
      queryClient.invalidateQueries({ queryKey: ['analyst-stats'] });
    }
  }, [messages, queryClient]);

  const events = eventsData?.data?.data || [];
  const pagination = eventsData?.data?.pagination;
  const stats = statsData?.data?.data;

  const severityBadge = (sev: number) => {
    if (sev >= 9) return 'bg-red-500/20 text-red-400';
    if (sev >= 7) return 'bg-orange-500/20 text-orange-400';
    if (sev >= 4) return 'bg-yellow-500/20 text-yellow-400';
    return 'bg-blue-500/20 text-blue-400';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Operasyon Paneli</h1>
        <p className="text-muted-foreground text-sm mt-1">Guvenlik olaylarini izle, filtrele ve yonet</p>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filtreler</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {/* Time range */}
          <select
            value={timeRange}
            onChange={(e) => { setTimeRange(Number(e.target.value)); setPage(1); }}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
          >
            {TIME_RANGES.map((t) => (
              <option key={t.hours} value={t.hours}>{t.label}</option>
            ))}
          </select>

          {/* Severity */}
          <select
            value={severityFilter.min ? `${severityFilter.min}-${severityFilter.max}` : ''}
            onChange={(e) => {
              if (!e.target.value) { setSeverityFilter({}); }
              else {
                const [min, max] = e.target.value.split('-').map(Number);
                setSeverityFilter({ min, max });
              }
              setPage(1);
            }}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
          >
            <option value="">Tum Seviyeler</option>
            {SEVERITY_RANGES.map((s) => (
              <option key={s.label} value={`${s.min}-${s.max}`}>{s.label}</option>
            ))}
          </select>

          {/* Integration */}
          <select
            value={integration}
            onChange={(e) => { setIntegration(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
          >
            <option value="">Tum Entegrasyonlar</option>
            <option value="cortex_xdr">Cortex XDR</option>
            <option value="palo_alto_panorama">Panorama</option>
            <option value="fortimail">FortiMail</option>
            <option value="zabbix">Zabbix</option>
          </select>

          {/* Event type */}
          <input
            type="text"
            placeholder="Olay tipi..."
            value={eventType}
            onChange={(e) => { setEventType(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
          />

          {/* Source IP */}
          <input
            type="text"
            placeholder="Kaynak IP..."
            value={sourceIp}
            onChange={(e) => { setSourceIp(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
          />

          {/* Resolved toggle */}
          <select
            value={resolvedFilter}
            onChange={(e) => { setResolvedFilter(e.target.value as '' | 'true' | 'false'); setPage(1); }}
            className="px-3 py-2 bg-background border border-border rounded-lg text-sm"
          >
            <option value="">Tumu</option>
            <option value="false">Acik</option>
            <option value="true">Cozulmus</option>
          </select>
        </div>

        {/* Search */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Baslik veya aciklamada ara..."
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-sm"
          />
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex gap-4">
        <div className="px-4 py-2 rounded-lg bg-card border border-border text-sm">
          Toplam: <span className="font-bold">{pagination?.total ?? 0}</span>
        </div>
        <div className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          Kritik: <span className="font-bold">{stats?.critical_unresolved ?? 0}</span>
        </div>
        <div className="px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
          Cozum bekleyen: <span className="font-bold">{stats?.unresolved_count ?? 0}</span>
        </div>
      </div>

      {/* Event Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Zaman</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Kaynak</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Hedef</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tip</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Severity</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Entegrasyon</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Durum</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-muted rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    Olay bulunamadi
                  </td>
                </tr>
              ) : (
                events.map((evt: Record<string, unknown>) => (
                  <tr
                    key={evt.id as string}
                    onClick={() => setSelectedEvent(evt)}
                    className="border-b border-border hover:bg-accent/50 cursor-pointer transition animate-fade-in"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {new Date(evt.time as string).toLocaleString('tr-TR')}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">{(evt.source_host as string) || (evt.source_ip as string) || '-'}</td>
                    <td className="px-4 py-3 text-xs">{(evt.dest_host as string) || (evt.dest_ip as string) || '-'}</td>
                    <td className="px-4 py-3 text-xs font-medium">{evt.event_type as string}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityBadge(evt.severity as number)}`}>
                        {evt.severity as number}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{evt.integration_name as string}</td>
                    <td className="px-4 py-3">
                      {(evt.is_resolved as boolean) ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">Cozuldu</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Acik</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <div className="flex items-center gap-2">
              <select
                value={limit}
                onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                className="px-2 py-1 bg-background border border-border rounded text-xs"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
              <span className="text-xs text-muted-foreground">satir/sayfa</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Sayfa {pagination.page} / {pagination.total_pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded hover:bg-accent disabled:opacity-30 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                disabled={page >= pagination.total_pages}
                className="p-1 rounded hover:bg-accent disabled:opacity-30 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Event Detail Drawer */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex">
          {/* Overlay */}
          <div className="flex-1 bg-black/50" onClick={() => setSelectedEvent(null)} />

          {/* Drawer */}
          <div className="w-full max-w-lg bg-card border-l border-border overflow-y-auto p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">Olay Detayi</h2>
              <button onClick={() => setSelectedEvent(null)} className="p-1 rounded hover:bg-accent transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground block text-xs mb-0.5">Severity</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${severityBadge(selectedEvent.severity as number)}`}>
                    {selectedEvent.severity as number}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs mb-0.5">Durum</span>
                  <span>
                    {(selectedEvent.is_resolved as boolean) ? 'Cozuldu' : 'Acik'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs mb-0.5">Zaman</span>
                  <span>{new Date(selectedEvent.time as string).toLocaleString('tr-TR')}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs mb-0.5">Entegrasyon</span>
                  <span>{selectedEvent.integration_name as string}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs mb-0.5">Kaynak IP</span>
                  <span>{(selectedEvent.source_ip as string) || '-'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs mb-0.5">Hedef IP</span>
                  <span>{(selectedEvent.dest_ip as string) || '-'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs mb-0.5">Kaynak Host</span>
                  <span>{(selectedEvent.source_host as string) || '-'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs mb-0.5">Hedef Host</span>
                  <span>{(selectedEvent.dest_host as string) || '-'}</span>
                </div>
              </div>

              <div>
                <span className="text-muted-foreground block text-xs mb-0.5">Baslik</span>
                <p className="font-medium">{selectedEvent.title as string}</p>
              </div>

              <div>
                <span className="text-muted-foreground block text-xs mb-0.5">Aciklama</span>
                <p>{selectedEvent.description as string}</p>
              </div>

              {selectedEvent.notes && (
                <div>
                  <span className="text-muted-foreground block text-xs mb-0.5">Notlar</span>
                  <p>{selectedEvent.notes as string}</p>
                </div>
              )}

              {/* Raw payload */}
              <div>
                <span className="text-muted-foreground block text-xs mb-1">Ham Payload</span>
                <pre className="p-3 rounded-lg bg-muted text-xs overflow-auto max-h-64">
                  {JSON.stringify(selectedEvent.raw_payload, null, 2)}
                </pre>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-border space-y-3">
                {!(selectedEvent.is_resolved as boolean) && (
                  <>
                    <textarea
                      value={resolveNotes}
                      onChange={(e) => setResolveNotes(e.target.value)}
                      placeholder="Cozum notu (opsiyonel)..."
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm resize-none"
                      rows={2}
                    />
                    <button
                      onClick={() => resolveMutation.mutate({ id: selectedEvent.id as string, notes: resolveNotes || undefined })}
                      disabled={resolveMutation.isPending}
                      className="w-full py-2 px-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium rounded-lg transition flex items-center justify-center gap-2 text-sm"
                    >
                      <Check className="w-4 h-4" />
                      Cozuldu Olarak Isaretle
                    </button>
                  </>
                )}

                {selectedEvent.source_ip && (
                  <button
                    onClick={() => router.push(`/virustotal?hash=${selectedEvent.source_ip}`)}
                    className="w-full py-2 px-4 border border-border hover:bg-accent text-sm font-medium rounded-lg transition flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    VirusTotal&apos;da Ara
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
