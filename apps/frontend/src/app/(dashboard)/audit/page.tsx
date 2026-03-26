'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react';

export default function AuditPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (user && !user.permissions.view_audit_logs) {
      router.push('/analyst');
    }
  }, [user, router]);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page],
    queryFn: () => auditApi.getLogs({ page, limit: 50 }),
  });

  const logs = data?.data?.data || [];
  const pagination = data?.data?.pagination;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Denetim Loglari</h1>
        <p className="text-muted-foreground text-sm mt-1">Tum kullanici islemlerinin kaydi</p>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Zaman</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Kullanici</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Islem</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Kaynak</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">IP</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground">
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Denetim logu bulunamadi
                  </td>
                </tr>
              ) : (
                logs.map((log: Record<string, unknown>) => (
                  <tr key={log.id as string} className="border-b border-border hover:bg-accent/50 transition">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at as string).toLocaleString('tr-TR')}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">{log.username as string}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                        {log.action as string}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{log.resource as string}{log.resource_id ? ` #${(log.resource_id as string).slice(0, 8)}` : ''}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{log.ip_address as string}</td>
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
