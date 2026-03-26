import { FastifyInstance } from 'fastify';
import { WebSocket } from '@fastify/websocket';
import { JWTPayload, RoleName } from '../types';
import logger from '../utils/logger';

interface AuthenticatedSocket {
  socket: WebSocket;
  userId: string;
  role: RoleName;
}

const connections = new Map<string, AuthenticatedSocket[]>();

// ─── WebSocket Kurulumu ──────────────────────────────────────────────────────

export function setupWebSocket(fastify: FastifyInstance): void {
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    // JWT token'i query parametresinden al
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      socket.close(4001, 'Token gerekli');
      return;
    }

    // Token dogrula
    let payload: JWTPayload;
    try {
      payload = fastify.jwt.verify<JWTPayload>(token);
    } catch {
      socket.close(4002, 'Gecersiz token');
      return;
    }

    const userId = payload.sub;
    const role = payload.role;

    // Baglanti kaydet
    const entry: AuthenticatedSocket = { socket, userId, role };
    if (!connections.has(userId)) {
      connections.set(userId, []);
    }
    connections.get(userId)!.push(entry);

    logger.info(`[WebSocket] Baglanti kuruldu: ${payload.username} (${role})`);

    // Ping-pong keepalive
    const pingInterval = setInterval(() => {
      if (socket.readyState === socket.OPEN) {
        socket.ping();
      }
    }, 30000);

    socket.on('close', () => {
      clearInterval(pingInterval);
      const userSockets = connections.get(userId);
      if (userSockets) {
        const idx = userSockets.indexOf(entry);
        if (idx >= 0) userSockets.splice(idx, 1);
        if (userSockets.length === 0) connections.delete(userId);
      }
      logger.info(`[WebSocket] Baglanti kapandi: ${payload.username}`);
    });

    socket.on('error', (err) => {
      logger.error(`[WebSocket] Hata: ${payload.username}`, { error: err.message });
    });

    // Hosgeldin mesaji
    socket.send(JSON.stringify({
      event: 'connected',
      data: { userId, role, message: 'WebSocket baglantisi kuruldu' },
    }));
  });
}

// ─── Broadcast ──────────────────────────────────────────────────────────────

export function broadcast(
  event: string,
  data: unknown,
  roleFilter?: RoleName[],
): void {
  const message = JSON.stringify({ event, data });

  for (const [, sockets] of connections) {
    for (const conn of sockets) {
      // Rol filtresi varsa kontrol et
      if (roleFilter && !roleFilter.includes(conn.role)) continue;

      // C-Level kullanicilari yalnizca severity >= 7 event'leri alir
      if (event === 'new_event' && conn.role === 'c_level') {
        const severity = (data as Record<string, unknown>)?.severity;
        if (typeof severity === 'number' && severity < 7) continue;
      }

      if (conn.socket.readyState === conn.socket.OPEN) {
        conn.socket.send(message);
      }
    }
  }
}

// ─── Belirli Kullaniciya Gonder ─────────────────────────────────────────────

export function sendToUser(userId: string, event: string, data: unknown): void {
  const message = JSON.stringify({ event, data });
  const userSockets = connections.get(userId);
  if (!userSockets) return;

  for (const conn of userSockets) {
    if (conn.socket.readyState === conn.socket.OPEN) {
      conn.socket.send(message);
    }
  }
}

// ─── Bagli Kullanici Sayisi ─────────────────────────────────────────────────

export function getConnectedCount(): number {
  let count = 0;
  for (const [, sockets] of connections) {
    count += sockets.length;
  }
  return count;
}
