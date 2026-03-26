import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool';
import { authenticate, requirePermission } from '../middleware/auth';
import { AuditLog } from '../types';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  user_id: z.string().uuid().optional(),
  action: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function auditRoutes(fastify: FastifyInstance): Promise<void> {
  const preHandler = [authenticate, requirePermission('view_audit_logs')];

  // ─── GET /api/audit ───────────────────────────────────────
  fastify.get('/', { preHandler }, async (req, reply) => {
    const parse = querySchema.safeParse(req.query);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: parse.error.errors[0].message });
    }

    const q = parse.data;
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (q.user_id) { conditions.push(`user_id = $${idx++}`); values.push(q.user_id); }
    if (q.action) { conditions.push(`action ILIKE $${idx++}`); values.push(`%${q.action}%`); }
    if (q.from) { conditions.push(`created_at >= $${idx++}`); values.push(q.from); }
    if (q.to) { conditions.push(`created_at <= $${idx++}`); values.push(q.to); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (q.page - 1) * q.limit;

    const [logs, countRows] = await Promise.all([
      query<AuditLog>(
        `SELECT * FROM audit_logs ${where}
         ORDER BY created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, q.limit, offset],
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM audit_logs ${where}`,
        values,
      ),
    ]);

    const total = parseInt(countRows[0]?.count ?? '0', 10);

    return reply.send({
      success: true,
      data: logs,
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        total_pages: Math.ceil(total / q.limit),
      },
    });
  });
}
