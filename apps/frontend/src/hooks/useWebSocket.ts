import { useEffect, useCallback } from 'react';
import { useWebSocketStore } from '@/lib/store';

type EventHandler = (data: unknown) => void;

export function useWebSocket(event?: string, handler?: EventHandler) {
  const { connected, messages } = useWebSocketStore();

  useEffect(() => {
    if (!event || !handler || messages.length === 0) return;

    const lastMsg = messages[0];
    if (lastMsg.event === event) {
      handler(lastMsg.data);
    }
  }, [event, handler, messages]);

  const getLatestByEvent = useCallback(
    (eventName: string) => {
      return messages.find((m) => m.event === eventName)?.data ?? null;
    },
    [messages],
  );

  return {
    connected,
    messages,
    getLatestByEvent,
  };
}
