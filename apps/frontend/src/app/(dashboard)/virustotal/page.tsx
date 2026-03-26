'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { virustotalApi } from '@/lib/api';
import { useAuthStore, useWebSocketStore } from '@/lib/store';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const VERDICT_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  clean: { label: 'TEMIZ', color: 'text-green-400', bgColor: 'bg-green-500/10 border-green-500/20', icon: <ShieldCheck className="w-8 h-8" /> },
  suspicious: { label: 'SUPHELI', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10 border-yellow-500/20', icon: <AlertTriangle className="w-8 h-8" /> },
  malicious: { label: 'KOTUCUL', color: 'text-red-400', bgColor: 'bg-red-500/10 border-red-500/20', icon: <ShieldAlert className="w-8 h-8" /> },
  unknown: { label: 'BILINMIYOR', color: 'text-slate-400', bgColor: 'bg-slate-500/10 border-slate-500/20', icon: <ShieldQuestion className="w-8 h-8" /> },
};

const PIE_COLORS = ['#ef4444', '#eab308', '#22c55e', '#6b7280'];

export default function VirusTotalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const messages = useWebSocketStore((s) => s.messages);
  const queryClient = useQueryClient();

  const [hashInput, setHashInput] = useState(searchParams.get('hash') || '');
  const [currentResult, setCurrentResult] = useState<Record<string, unknown> | null>(null);
  const [page, setPage] = useState(1);

  // Permission check
  useEffect(() => {
    if (user && !user.permissions.trigger_virustotal) {
      router.push('/analyst');
    }
  }, [user, router]);

  // Listen for VT results from WebSocket
  useEffect(() => {
    const lastMsg = messages[0];
    if (lastMsg?.event === 'vt_result') {
      const data = lastMsg.data as Record<string, unknown>;
      setCurrentResult(data);
      queryClient.invalidateQueries({ queryKey: ['vt-history'] });
    }
  }, [messages, queryClient]);

  // Auto-detect hash type
  const detectHashType = (hash: string): string => {
    const len = hash.trim().length;
    if (len === 32) return 'MD5';
    if (len === 40) return 'SHA1';
    if (len === 64) return 'SHA256';
    return 'Bilinmiyor';
  };

  // Scan mutation
  const scanMutation = useMutation({
    mutationFn: (hash: string) => virustotalApi.scanHash(hash),
    onSuccess: (response) => {
      const data = response.data?.data;
      if (data?.verdict) {
        setCurrentResult(data);
      }
      queryClient.invalidateQueries({ queryKey: ['vt-history'] });
    },
  });

  // History query
  const { data: historyData } = useQuery({
    queryKey: ['vt-history', page],
    queryFn: () => virustotalApi.getHistory({ page, limit: 20 }),
  });

  const history = historyData?.data?.data || [];
  const pagination = historyData?.data?.pagination;

  const handleScan = () => {
    const hash = hashInput.trim();
    if (!hash) return;
    setCurrentResult(null);
    scanMutation.mutate(hash);
  };

  const verdictConfig = currentResult?.verdict
    ? VERDICT_CONFIG[(currentResult.verdict as string)] || VERDICT_CONFIG.unknown
    : null;

  const pieData = currentResult
    ? [
        { name: 'Malicious', value: (currentResult.malicious_count as number) || 0 },
        { name: 'Suspicious', value: (currentResult.suspicious_count as number) || 0 },
        { name: 'Clean', value: (currentResult.harmless_count as number) || 0 },
        { name: 'Undetected', value: (currentResult.undetected_count as number) || 0 },
      ]
    : [];

  const cacheAge = currentResult?.scanned_at
    ? Math.round((Date.now() - new Date(currentResult.scanned_at as string).getTime()) / 60000)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">VirusTotal Tarama</h1>
        <p className="text-muted-foreground text-sm mt-1">Hash degerleriyle dosya itibar sorgulama</p>
      </div>

      {/* Scan Form */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={hashInput}
              onChange={(e) => setHashInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
              placeholder="SHA256, MD5 veya SHA1 hash girin..."
              className="w-full pl-11 pr-4 py-3 bg-background border border-border rounded-lg text-sm font-mono"
            />
          </div>
          <button
            onClick={handleScan}
            disabled={scanMutation.isPending || !hashInput.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition flex items-center gap-2"
          >
            {scanMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Tara
          </button>
        </div>
        {hashInput.trim() && (
          <p className="text-xs text-muted-foreground mt-2">
            Algilanan hash tipi: <span className="font-medium">{detectHashType(hashInput)}</span>
          </p>
        )}
      </div>

      {/* Result Card */}
      {currentResult && verdictConfig && (
        <div className={`rounded-xl border p-6 ${verdictConfig.bgColor}`}>
          {cacheAge !== null && cacheAge > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
              <Clock className="w-3 h-3" />
              Bu hash {cacheAge} dakika once tarandi, onbellekten gosteriliyor
            </div>
          )}

          <div className="flex items-start gap-6">
            {/* Verdict */}
            <div className="text-center">
              <div className={`${verdictConfig.color} mb-2`}>{verdictConfig.icon}</div>
              <span className={`text-lg font-bold ${verdictConfig.color}`}>{verdictConfig.label}</span>
            </div>

            {/* Donut chart */}
            <div className="w-40 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={60}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Stats */}
            <div className="flex-1 grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 rounded bg-background/50">
                <span className="text-muted-foreground text-xs block">Malicious</span>
                <span className="font-bold text-red-400">{currentResult.malicious_count as number}</span>
              </div>
              <div className="p-2 rounded bg-background/50">
                <span className="text-muted-foreground text-xs block">Suspicious</span>
                <span className="font-bold text-yellow-400">{currentResult.suspicious_count as number}</span>
              </div>
              <div className="p-2 rounded bg-background/50">
                <span className="text-muted-foreground text-xs block">Clean</span>
                <span className="font-bold text-green-400">{currentResult.harmless_count as number}</span>
              </div>
              <div className="p-2 rounded bg-background/50">
                <span className="text-muted-foreground text-xs block">Undetected</span>
                <span className="font-bold text-slate-400">{currentResult.undetected_count as number}</span>
              </div>
              {currentResult.file_name && (
                <div className="col-span-2 p-2 rounded bg-background/50">
                  <span className="text-muted-foreground text-xs block">Dosya</span>
                  <span className="font-medium text-xs">
                    {currentResult.file_name as string}
                    {currentResult.file_type && ` (${currentResult.file_type})`}
                    {currentResult.file_size && ` - ${Math.round((currentResult.file_size as number) / 1024)} KB`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scanning state */}
      {scanMutation.isPending && !currentResult && (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-3" />
          <p className="text-sm text-muted-foreground">Tarama yapiliyor, lutfen bekleyin...</p>
        </div>
      )}

      {/* Error */}
      {scanMutation.isError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          Tarama sirasinda bir hata olustu. API anahtarinin tanimli oldugundan emin olun.
        </div>
      )}

      {/* History Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Gecmis Taramalar</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Hash</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Verdict</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Malicious/Total</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tarih</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tarayan</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-muted-foreground">
                    Henuz tarama yapilmamis
                  </td>
                </tr>
              ) : (
                history.map((scan: Record<string, unknown>) => {
                  const vc = VERDICT_CONFIG[(scan.verdict as string)] || VERDICT_CONFIG.unknown;
                  return (
                    <tr
                      key={scan.id as string}
                      onClick={() => {
                        setCurrentResult(scan);
                        setHashInput(scan.hash as string);
                      }}
                      className="border-b border-border hover:bg-accent/50 cursor-pointer transition"
                    >
                      <td className="px-4 py-3 font-mono text-xs max-w-[200px] truncate">{scan.hash as string}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${vc.color} ${vc.bgColor.split(' ')[0]}`}>
                          {vc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="text-red-400 font-medium">{scan.malicious_count as number}</span>
                        <span className="text-muted-foreground">/{scan.total_engines as number}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(scan.scanned_at as string).toLocaleString('tr-TR')}
                      </td>
                      <td className="px-4 py-3 text-xs">{scan.scanned_by as string}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.total_pages > 1 && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              {pagination.page}/{pagination.total_pages}
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
        )}
      </div>
    </div>
  );
}
