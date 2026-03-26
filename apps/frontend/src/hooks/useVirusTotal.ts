import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { virustotalApi } from '@/lib/api';
import { useWebSocketStore } from '@/lib/store';

export function useVirusTotal() {
  const queryClient = useQueryClient();
  const messages = useWebSocketStore((s) => s.messages);
  const [currentResult, setCurrentResult] = useState<Record<string, unknown> | null>(null);

  // Listen for VT results from WebSocket
  useEffect(() => {
    const lastMsg = messages[0];
    if (lastMsg?.event === 'vt_result') {
      setCurrentResult(lastMsg.data as Record<string, unknown>);
      queryClient.invalidateQueries({ queryKey: ['vt-history'] });
    }
  }, [messages, queryClient]);

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

  return {
    currentResult,
    setCurrentResult,
    scan: scanMutation.mutate,
    isScanning: scanMutation.isPending,
    scanError: scanMutation.isError,
  };
}

export function useVTHistory(page: number = 1, limit: number = 20) {
  return useQuery({
    queryKey: ['vt-history', page, limit],
    queryFn: () => virustotalApi.getHistory({ page, limit }),
  });
}
