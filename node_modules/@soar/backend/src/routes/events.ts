import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { authenticate, requirePermission, logAudit } from '../middleware/auth';
import { SecurityEvent } from '../types';

const querySchema = z.object({
  page:             z.coerce.number().int().min(1).default(1),
  limit:            z.coerce.number().int().min(1).max(500).default(50),
  severity_min:     z.coerce.number().int().min(1).max(10).optional(),
  severity_max:     z.coerce.number().int().min(1).max(10).optional(),
  event_type:       z.string().optional(),
  integration_name: z.string().optional(),
  source_ip:        z.string().optional(),
  is_resolved:      z.enum(['true','false']).optional(),
  from:             z.string().datetime().optional(),
  to:               z.string().datetime().optional(),
  search:           z.string().optional(),
});

const resolveSchema = z.object({
  notes: z.string().optional(),
});

export async function eventsRoutes(fastify: FastifyInstance): Promise<void> {
  const preHandler = [authenticate, requirePermission('view_security_events')];

  // ─── GET /api/events ─────────────────────────────────────
  fastify.get('/', { preHandler }, async (req, reply) => {
    const parse = querySchema.safeParse(req.query);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: parse.error.errors[0].message });
    }
    const q = parse.data;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (q.from)             { conditions.push(`time >= $${idx++}`);              values.push(q.from); }
    if (q.to)               { conditions.push(`time <= $${idx++}`);              values.push(q.to); }
    if (q.severity_min)     { conditions.push(`severity >= $${idx++}`);          values.push(q.severity_min); }
    if (q.severity_max)     { conditions.push(`severity <= $${idx++}`);          values.push(q.severity_max); }
    if (q.event_type)       { conditions.push(`event_type = $${idx++}`);         values.push(q.event_type); }
    if (q.integration_name) { conditions.push(`integration_name = $${idx++}`);   values.push(q.integration_name); }
    if (q.source_ip)        { conditions.push(`source_ip::text ILIKE $${idx++}`); values.push(`%${q.source_ip}%`); }
    if (q.is_resolved)      { conditions.push(`is_resolved = $${idx++}`);        values.push(q.is_resolved === 'true'); }
    if (q.search) {
      conditions.push(`(title ILIKE $${idx} OR description ILIKE $${idx})`);
      values.push(`%${q.search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (q.page - 1) * q.limit;

    const [events, countRows] = await Promise.all([
      query<SecurityEvent>(
        `SELECT id, time, integration_id, integration_name,
                source_ip, dest_ip, source_host, dest_host,
                severity, event_type, title, description,
                is_resolved, resolved_at, notes
         FROM security_events
         ${where}
         ORDER BY time DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, q.limit, offset]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM security_events ${where}`,
        values
      ),
    ]);

    const total = parseInt(countRows[0]?.count ?? '0', 10);

    return reply.send({
      success: true,
      data: events,
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        total_pages: Math.ceil(total / q.limit),
      },
    });
  });

  // ─── GET /api/events/:time/:id ───────────────────────────
  // TimescaleDB'de PK = (time, id)
  fastify.get('/:id', { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const event = await queryOne<SecurityEvent>(
      'SELECT * FROM security_events WHERE id = $1 ORDER BY time DESC LIMIT 1',
      [id]
    );
    if (!event) return reply.code(404).send({ success: false, error: 'Olay bulunamadı' });
    return reply.send({ success: true, data: event });
  });

  // ─── PATCH /api/events/:id/resolve ───────────────────────
  fastify.patch('/:id/resolve', { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = resolveSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: parse.error.errors[0].message });
    }

    const [updated] = await query<{ id: string }>(
      `UPDATE security_events
       SET is_resolved = true,
           resolved_by = $1,
           resolved_at = NOW(),
           notes = COALESCE($2, notes)
       WHERE id = $3
       RETURNING id`,
      [req.user.sub, parse.data.notes ?? null, id]
    );

    if (!updated) return reply.code(404).send({ success: false, error: 'Olay bulunamadı' });

    await logAudit(req, 'resolve_event', 'security_events', id);

    return reply.send({ success: true, message: 'Olay çözüldü olarak işaretlendi' });
  });

  // ─── GET /api/events/stats/summary ───────────────────────
  fastify.get('/stats/summary', { preHandler }, async (req, reply) => {
    const hours = Number((req.query as Record<string, string>).hours ?? 24);

    const [bySeverity, byType, byIntegration, topSources, unresolvedCount] = await Promise.all([
      // Severity dağılımı
      query(`
        SELECT severity, COUNT(*)::int as count
        FROM security_events
        WHERE time > NOW() - INTERVAL '${hours} hours'
        GROUP BY severity
        ORDER BY severity DESC
      `),
      // Olay tipi dağılımı
      query(`
        SELECT event_type, COUNT(*)::int as count
        FROM security_events
        WHERE time > NOW() - INTERVAL '${hours} hours'
        GROUP BY event_type
        ORDER BY count DESC
        LIMIT 10
      `),
      // Entegrasyon bazlı
      query(`
        SELECT integration_name, COUNT(*)::int as count
        FROM security_events
        WHERE time > NOW() - INTERVAL '${hours} hours'
        GROUP BY integration_name
        ORDER BY count DESC
      `),
      // En çok olaydan kaynak IP'ler
      query(`
        SELECT source_ip::text as ip, COUNT(*)::int as count
        FROM security_events
        WHERE time > NOW() - INTERVAL '${hours} hours'
          AND source_ip IS NOT NULL
        GROUP BY source_ip
        ORDER BY count DESC
        LIMIT 10
      `),
      // Çözülmemiş olay sayısı
      query<{ count: string }>(
        "SELECT COUNT(*)::text as count FROM security_events WHERE is_resolved = false"
      ),
    ]);

    return reply.send({
      success: true,
      data: {
        by_severity: bySeverity,
        by_type: byType,
        by_integration: byIntegration,
        top_source_ips: topSources,
        unresolved_count: parseInt(unresolvedCount[0]?.count ?? '0', 10),
        hours_range: hours,
      },
    });
  });

  // ─── GET /api/events/stats/timeline ──────────────────────
  fastify.get('/stats/timeline', { preHandler }, async (req, reply) => {
    const qs = req.query as Record<string, string>;
    const interval = qs.interval ?? '1 hour';
    const hours    = Number(qs.hours ?? 24);

    const validIntervals = ['15 minutes', '1 hour', '6 hours', '1 day'];
    if (!validIntervals.includes(interval)) {
      return reply.code(400).send({ success: false, error: 'Geçersiz interval' });
    }

    const rows = await query(`
      SELECT
        time_bucket($1::interval, time) AS bucket,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE severity >= 7)::int as critical
      FROM security_events
      WHERE time > NOW() - ($2 || ' hours')::interval
      GROUP BY bucket
      ORDER BY bucket ASC
    `, [interval, hours]);

    return reply.send({ success: true, data: rows });
  });

  // ─── GET /api/events/stats/executive ─────────────────────
  // C-Level dashboard için özet
  fastify.get('/stats/executive', {
    preHandler: [authenticate, requirePermission('view_executive_dashboard')],
  }, async (_req, reply) => {
    const [today, week, critical, blocked] = await Promise.all([
      query<{ count: string }>(
        "SELECT COUNT(*)::text as count FROM security_events WHERE time > NOW() - INTERVAL '24 hours'"
      ),
      query<{ count: string }>(
        "SELECT COUNT(*)::text as count FROM security_events WHERE time > NOW() - INTERVAL '7 days'"
      ),
      query<{ count: string }>(
        "SELECT COUNT(*)::text as count FROM security_events WHERE severity >= 8 AND time > NOW() - INTERVAL '24 hours'"
      ),
      query<{ count: string }>(
        "SELECT COUNT(*)::text as count FROM security_events WHERE event_type = 'firewall_block' AND time > NOW() - INTERVAL '24 hours'"
      ),
    ]);

    return reply.send({
      success: true,
      data: {
        threats_today: parseInt(today[0]?.count ?? '0', 10),
        threats_week:  parseInt(week[0]?.count ?? '0', 10),
        critical_today: parseInt(critical[0]?.count ?? '0', 10),
        blocked_today:  parseInt(blocked[0]?.count ?? '0', 10),
      },
    });
  });
}
