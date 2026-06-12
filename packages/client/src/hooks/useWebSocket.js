import { useEffect, useRef, useCallback } from 'react';

/**
 * WebSocket 热更新 hook
 * 监听后端 html_caches 目录变化，自动刷新 iframe
 */
export function useWebSocket(onRefresh) {
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const queueRef = useRef([]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      console.log('[WS] Connected');
      const queued = queueRef.current;
      queueRef.current = [];
      queued.forEach((payload) => ws.send(JSON.stringify(payload)));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onRefresh?.(data);
      } catch (e) {
        // ignore
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected, reconnecting...');
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [onRefresh]);

  const send = useCallback((payload) => {
    if (!payload) return;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return;
    }
    queueRef.current.push(payload);
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return send;
}
