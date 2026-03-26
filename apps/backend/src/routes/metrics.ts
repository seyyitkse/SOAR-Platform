import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool';
import { authenticate, requirePermission } from '../middleware/auth';
import { getZabbixHosts } from '../workers/collectors/zabbix';

const timelineSchema = z.object({
  metric_name: z.string(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  interval: z.enum(['15 minutes', '1 hour', '6 hours', '1 day']).default('1 hour'),
});

export async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  const preHandler = [authenticate, requirePermission('view_system_metrics')];

  // ─── GET /api/metrics/hosts ───────────────────────────────
  fastify.get('/hosts', { preHandler }, async (_req, reply) => {
    try {
      const hosts = await getZabbixHosts();
      return reply.send({ success: true, data: hosts });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
      return reply.code(500).send({ success: false, error: message });
    }
  });

  // ─── GET /api/metrics/hosts/:hostId/timeline ──────────────
  fastify.get('/hosts/:hostId/timeline', { preHandler }, async (req, reply) => {
    const { hostId } = req.params as { hostId: string };
    const parse = timelineSchema.safeParse(req.query);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: parse.error.errors[0].message });
    }

    const { metric_name, interval } = parse.data;
    const from = parse.data.from ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = parse.data.to ?? new Date().toISOString();

    const rows = await query(
      `SELECT
         time_bucket($1::interval, time) AS bucket,
         AVG(value) AS avg_value,
         MAX(value) AS max_value,
         MIN(value) AS min_value
       FROM system_metrics
       WHERE host_id = $2 AND metric_name = $3
         AND time >= $4::timestamptz AND time <= $5::timestamptz
       GROUP BY bucket
       ORDER BY bucket ASC`,
      [interval, hostId, metric_name, from, to],
    );

    return reply.send({ success: true, data: rows });
  });

  // ─── GET /api/metrics/summary ─────────────────────────────
  fastify.get('/summary', { preHandler }, async (_req, reply) => {
    // Her host icin en son metrik degerleri
    const rows = await query(`
      SELECT DISTINCT ON (host_id, metric_name)
        host_id, host_name, metric_name, value, unit, time, tags
      FROM system_metrics
      ORDER BY host_id, metric_name, time DESC
    `);

    // Host bazli gruplama
    const hostMap = new Map<string, Record<string, unknown>>();

    for (const row of rows as Array<Record<string, unknown>>) {
      const hostId = String(row.host_id);
      if (!hostMap.has(hostId)) {
        hostMap.set(hostId, {
          host_id: hostId,
          host_name: row.host_name,
          tags: row.tags,
          metrics: {},
          last_update: row.time,
        });
      }
      const host = hostMap.get(hostId)!;
      (host.metrics as Record<string, unknown>)[String(row.metric_name)] = {
        value: row.value,
        unit: row.unit,
        time: row.time,
      };
      // En son guncelleme zamani
      if (new Date(String(row.time)) > new Date(String(host.last_update))) {
        host.last_update = row.time;
      }
    }

    return reply.send({
      success: true,
      data: Array.from(hostMap.values()),
    });
  });

  // ─── GET /api/metrics/uptime ──────────────────────────────
  fastify.get('/uptime', {
    preHandler: [authenticate, requirePermission('view_executive_dashboard')],
  }, async (_req, reply) => {
    // Uptime hesaplama: uptime_seconds metriginin varligina gore
    // Son 24 saat, 7 gun, 30 gun icin her host
    const rows = await query(`
      WITH periods AS (
        SELECT
          host_id,
          host_name,
          -- Son 24 saat
          COUNT(*) FILTER (WHERE time > NOW() - INTERVAL '24 hours') AS samples_24h,
          COUNT(*) FILTER (WHERE time > NOW() - INTERVAL '24 hours' AND value > 0) AS up_24h,
          -- Son 7 gun
          COUNT(*) FILTER (WHERE time > NOW() - INTERVAL '7 days') AS samples_7d,
          COUNT(*) FILTER (WHERE time > NOW() - INTERVAL '7 days' AND value > 0) AS up_7d,
          -- Son 30 gun
          COUNT(*) AS samples_30d,
          COUNT(*) FILTER (WHERE value > 0) AS up_30d
        FROM system_metrics
        WHERE metric_name = 'uptime_seconds'
          AND time > NOW() - INTERVAL '30 days'
        GROUP BY host_id, host_name
      )
      SELECT
        host_id, host_name,
        CASE WHEN samples_24h > 0 THEN ROUND((up_24h::numeric / samples_24h) * 100, 2) ELSE 0 END AS uptime_24h,
        CASE WHEN samples_7d > 0 THEN ROUND((up_7d::numeric / samples_7d) * 100, 2) ELSE 0 END AS uptime_7d,
        CASE WHEN samples_30d > 0 THEN ROUND((up_30d::numeric / samples_30d) * 100, 2) ELSE 0 END AS uptime_30d
      FROM periods
      ORDER BY host_name ASC
    `);

    return reply.send({ success: true, data: rows });
  });
}
