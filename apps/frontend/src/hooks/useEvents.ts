import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsApi, EventsParams } from '@/lib/api';

export function useEvents(params: EventsParams = {}) {
  return useQuery({
    queryKey: ['events', params],
    queryFn: () => eventsApi.getEvents(params),
    refetchInterval: 30_000,
  });
}

export function useEventStats() {
  return useQuery({
    queryKey: ['event-stats'],
    queryFn: () => eventsApi.getEventStats(),
    refetchInterval: 60_000,
  });
}

export function useEventTimeline(params: { interval?: string; from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['event-timeline', params],
    queryFn: () => eventsApi.getTimeline(params),
    refetchInterval: 60_000,
  });
}

export function useResolveEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => eventsApi.resolveEvent(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['event-stats'] });
    },
  });
}
