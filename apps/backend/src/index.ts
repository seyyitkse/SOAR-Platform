import 'dotenv/config';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebSocket from '@fastify/websocket';
import IORedis from 'ioredis';

import { closePool, getPool } from './db/pool';
import { getRedis, closeRedis } from './db/redis';
import { closeAllQueues } from './workers/queue';
import logger from './utils/logger';

// Routes
import { authRoutes } from './routes/auth';
import { usersRoutes } from './routes/users';
import { integrationsRoutes } from './routes/integrations';
import { eventsRoutes } from './routes/events';
import { metricsRoutes } from './routes/metrics';
import { virusTotalRoutes } from './routes/virustotal';
import { alertRulesRoutes } from './routes/alertRules';
import { reportsRoutes } from './routes/reports';
import { auditRoutes } from './routes/audit';

// WebSocket
import { setupWebSocket, getConnectedCount } from './services/websocket';

// Workers
import { registerCortexXDRWorker } from './workers/collectors/cortexXDR';
import { registerPanoramaWorker } from './workers/collectors/panorama';
import { registerFortiMailWorker } from './workers/collectors/fortimail';
import { registerZabbixWorker } from './workers/collectors/zabbix';
import { registerVirusTotalWorker } from './workers/collectors/virustotal';

// Report Scheduler
import { startReportScheduler } from './workers/reports/scheduler';

// ─── Fastify Instance ────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

async function bootstrap(): Promise<void> {
  const fastify = Fastify({
    logger: false, // Winston kullaniyoruz
    trustProxy: true,
  });

  // ─── Plugins ──────────────────────────────────────────────

  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: false, // Frontend proxy icin
  });

  await fastify.register(fastifyCors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      return req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()
        ?? req.ip
        ?? 'unknown';
    },
  });

  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'soar-platform-secret-change-me',
    sign: {
      expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
    },
  });

  await fastify.register(fastifyWebSocket);

  // ─── Auth routes — daha siki rate limit ───────────────────

  await fastify.register(async (authScope) => {
    await authScope.register(fastifyRateLimit, {
      max: 5,
      timeWindow: '1 minute',
    });
    await authScope.register(authRoutes);
  }, { prefix: '/api/auth' });

  // ─── Diger Routes ─────────────────────────────────────────

  await fastify.register(usersRoutes, { prefix: '/api/users' });
  await fastify.register(integrationsRoutes, { prefix: '/api/integrations' });
  await fastify.register(eventsRoutes, { prefix: '/api/events' });
  await fastify.register(metricsRoutes, { prefix: '/api/metrics' });
  await fastify.register(virusTotalRoutes, { prefix: '/api/virustotal' });
  await fastify.register(alertRulesRoutes, { prefix: '/api/alert-rules' });
  await fastify.register(reportsRoutes, { prefix: '/api/reports' });
  await fastify.register(auditRoutes, { prefix: '/api/audit' });

  // ─── WebSocket ────────────────────────────────────────────

  setupWebSocket(fastify);

  // ─── Health Check ─────────────────────────────────────────

  fastify.get('/health', async (_req, reply) => {
    let dbStatus = 'ok';
    let redisStatus = 'ok';

    try {
      await getPool().query('SELECT 1');
    } catch {
      dbStatus = 'error';
    }

    try {
      await getRedis().ping();
    } catch {
      redisStatus = 'error';
    }

    const status = dbStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded';

    return reply.code(status === 'ok' ? 200 : 503).send({
      status,
      db: dbStatus,
      redis: redisStatus,
      websocket_connections: getConnectedCount(),
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // ─── Workers ──────────────────────────────────────────────

  const redisConnection = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
  });

  registerCortexXDRWorker(redisConnection);
  registerPanoramaWorker(redisConnection);
  registerFortiMailWorker(redisConnection);
  registerZabbixWorker(redisConnection);
  registerVirusTotalWorker(redisConnection);

  // ─── Report Scheduler ────────────────────────────────────

  startReportScheduler();

  // ─── Graceful Shutdown ────────────────────────────────────

  const shutdown = async (signal: string) => {
    logger.info(`${signal} sinyali alindi, kapatiliyor...`);

    try {
      await fastify.close();
      logger.info('Fastify kapatildi');
    } catch (err) {
      logger.error('Fastify kapatma hatasi', { error: (err as Error).message });
    }

    try {
      await closeAllQueues();
      logger.info('Queue\'lar kapatildi');
    } catch (err) {
      logger.error('Queue kapatma hatasi', { error: (err as Error).message });
    }

    try {
      await closeRedis();
      logger.info('Redis kapatildi');
    } catch (err) {
      logger.error('Redis kapatma hatasi', { error: (err as Error).message });
    }

    try {
      await closePool();
      logger.info('PostgreSQL havuzu kapatildi');
    } catch (err) {
      logger.error('DB kapatma hatasi', { error: (err as Error).message });
    }

    try {
      await redisConnection.quit();
    } catch { /* sessizce gec */ }

    logger.info('Tum kaynaklar kapatildi. Cikiliyor.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ─── Start ────────────────────────────────────────────────

  try {
    await fastify.listen({ port: PORT, host: HOST });
    logger.info(`SOAR Platform Backend baslatildi: http://${HOST}:${PORT}`);
    logger.info(`Health check: http://${HOST}:${PORT}/health`);
  } catch (err) {
    logger.error('Sunucu baslatma hatasi', { error: (err as Error).message });
    process.exit(1);
  }
}

bootstrap();
