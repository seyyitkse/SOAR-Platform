'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reportsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Download,
  Trash2,
  Loader2,
  Plus,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';

const TYPE_LABELS: Record<string, string> = {
  daily: 'Gunluk',
  weekly: 'Haftalik',
  monthly: 'Aylik',
};

const ROLE_LABELS: Record<string, string> = {
  c_level: 'C-Level',
  analyst: 'Analist',
  all: 'Tumu',
};

export default function ReportsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [showGenerate, setShowGenerate] = useState(false);
  const [genType, setGenType] = useState('daily');
  const [genRole, setGenRole] = useState('c_level');

  // Permission check
  useEffect(() => {
    if (user && !user.permissions.view_reports) {
      router.push('/analyst');
    }
  }, [user, router]);

  // Reports list
  const { data: reportsData, isLoading } = useQuery({
    queryKey: ['reports', page],
    queryFn: () => reportsApi.getReports({ page, limit: 20 }),
    refetchInterval: 30_000,
  });

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: (data: { type: string; targetRole: string }) => reportsApi.generateReport(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      setShowGenerate(false);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => reportsApi.deleteReport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });

  // Download handler
  const handleDownload = async (id: string, fileName: string) => {
    try {
      const response = await reportsApi.downloadReport(id);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || `${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // error handled by interceptor
    }
  };

  const reports = reportsData?.data?.data || [];
  const pagination = reportsData?.data?.pagination;
  const canGenerate = user?.permissions.generate_reports;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Raporlar</h1>
          <p className="text-muted-foreground text-sm mt-1">Otomatik ve manuel olusturulan PDF raporlar</p>
        </div>
        {canGenerate && (
          <button
            onClick={() => setShowGenerate(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Rapor Olustur
          </button>
        )}
      </div>

      {/* Auto schedule info */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
        <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-300">
          <p className="font-medium mb-1">Otomatik Rapor Takvimi</p>
          <ul className="space-y-0.5 text-xs text-blue-400/80">
            <li>Gunluk raporlar her gun 07:00&apos;de otomatik olusturulur</li>
            <li>Haftalik raporlar her Pazartesi 07:00&apos;de olusturulur</li>
            <li>Aylik raporlar her ayin 1&apos;inde 07:00&apos;de olusturulur</li>
          </ul>
        </div>
      </div>

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowGenerate(false)} />
          <div className="relative w-full max-w-md bg-card border border-border rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4">Rapor Olustur</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Rapor Tipi</label>
                <select
                  value={genType}
                  onChange={(e) => setGenType(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                >
                  <option value="daily">Gunluk</option>
                  <option value="weekly">Haftalik</option>
                  <option value="monthly">Aylik</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Hedef Kitle</label>
                <select
                  value={genRole}
                  onChange={(e) => setGenRole(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                >
                  <option value="c_level">C-Level</option>
                  <option value="analyst">Analist</option>
                  <option value="all">Tumu</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowGenerate(false)}
                  className="flex-1 py-2 px-4 border border-border hover:bg-accent rounded-lg text-sm transition"
                >
                  Iptal
                </button>
                <button
                  onClick={() => generateMutation.mutate({ type: genType, targetRole: genRole })}
                  disabled={generateMutation.isPending}
                  className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition flex items-center justify-center gap-2"
                >
                  {generateMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Hazirlaniyor...</>
                  ) : (
                    'Olustur'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reports List */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tip</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Donem</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Hedef</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Olusturulma</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Islem</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Henuz rapor olusturulmamis
                  </td>
                </tr>
              ) : (
                reports.map((report: Record<string, unknown>) => (
                  <tr key={report.id as string} className="border-b border-border hover:bg-accent/50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{TYPE_LABELS[(report.type as string)] || report.type}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(report.period_start as string).toLocaleDateString('tr-TR')} - {new Date(report.period_end as string).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        {ROLE_LABELS[(report.target_role as string)] || report.target_role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(report.generated_at as string).toLocaleString('tr-TR')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {report.pdf_path && (
                          <button
                            onClick={() => handleDownload(report.id as string, `${report.type}_${report.target_role}.pdf`)}
                            className="p-1.5 rounded hover:bg-accent text-blue-400 hover:text-blue-300 transition"
                            title="Indir"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm('Bu rapor silinecek. Emin misiniz?')) {
                              deleteMutation.mutate(report.id as string);
                            }
                          }}
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.total_pages > 1 && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">{pagination.page}/{pagination.total_pages}</span>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="p-1 rounded hover:bg-accent disabled:opacity-30 transition">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))} disabled={page >= pagination.total_pages} className="p-1 rounded hover:bg-accent disabled:opacity-30 transition">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
