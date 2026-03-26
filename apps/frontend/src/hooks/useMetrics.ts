import { useQuery } from '@tanstack/react-query';
import { metricsApi } from '@/lib/api';

export function useHosts() {
  return useQuery({
    queryKey: ['metric-hosts'],
    queryFn: () => metricsApi.getHosts(),
    refetchInterval: 60_000,
  });
}

export function useHostTimeline(
  hostId: string | null,
  params: { metric?: string; from?: string; to?: string; interval?: string } = {},
) {
  return useQuery({
    queryKey: ['host-timeline', hostId, params],
    queryFn: () => metricsApi.getHostTimeline(hostId!, params),
    enabled: !!hostId,
    refetchInterval: 30_000,
  });
}

export function useMetricsSummary() {
  return useQuery({
    queryKey: ['metric-summary'],
    queryFn: () => metricsApi.getSummary(),
    refetchInterval: 30_000,
  });
}

export function useUptime() {
  return useQuery({
    queryKey: ['metric-uptime'],
    queryFn: () => metricsApi.getUptime(),
    refetchInterval: 60_000,
  });
}
