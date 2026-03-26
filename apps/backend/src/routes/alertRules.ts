import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { authenticate, requirePermission, logAudit } from '../middleware/auth';
import { AlertRule } from '../types';

const alertRuleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().default(''),
  integration_name: z.string().nullable().optional().default(null),
  event_type: z.string().nullable().optional().default(null),
  severity_threshold: z.number().int().min(1).max(10),
  condition: z.object({
    count_threshold: z.number().int().min(1).optional(),
    time_window_minutes: z.number().int().min(1).optional(),
  }).default({}),
  action: z.enum(['notify', 'log', 'notify_and_log']),
  notify_channels: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
});

const updateSchema = alertRuleSchema.partial();

export async function alertRulesRoutes(fastify: FastifyInstance): Promise<void> {
  const preHandler = [authenticate, requirePermission('manage_alert_rules')];

  // ─── GET /api/alert-rules ─────────────────────────────────
  fastify.get('/', { preHandler }, async (_req, reply) => {
    const rules = await query<AlertRule>(
      `SELECT * FROM alert_rules ORDER BY created_at DESC`,
    );
    return reply.send({ success: true, data: rules });
  });

  // ─── POST /api/alert-rules ────────────────────────────────
  fastify.post('/', { preHandler }, async (req, reply) => {
    const parse = alertRuleSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: parse.error.errors[0].message });
    }

    const d = parse.data;

    const [rule] = await query<AlertRule>(
      `INSERT INTO alert_rules
        (name, description, integration_name, event_type, severity_threshold,
         condition, action, notify_channels, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        d.name, d.description, d.integration_name, d.event_type,
        d.severity_threshold, JSON.stringify(d.condition), d.action,
        JSON.stringify(d.notify_channels), d.is_active, req.user.sub,
      ],
    );

    await logAudit(req, 'create_alert_rule', 'alert_rules', rule.id);

    return reply.code(201).send({ success: true, data: rule });
  });

  // ─── PUT /api/alert-rules/:id ─────────────────────────────
  fastify.put('/:id', { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = updateSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: parse.error.errors[0].message });
    }

    const d = parse.data;
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (d.name !== undefined) { sets.push(`name = $${idx++}`); values.push(d.name); }
    if (d.description !== undefined) { sets.push(`description = $${idx++}`); values.push(d.description); }
    if (d.integration_name !== undefined) { sets.push(`integration_name = $${idx++}`); values.push(d.integration_name); }
    if (d.event_type !== undefined) { sets.push(`event_type = $${idx++}`); values.push(d.event_type); }
    if (d.severity_threshold !== undefined) { sets.push(`severity_threshold = $${idx++}`); values.push(d.severity_threshold); }
    if (d.condition !== undefined) { sets.push(`condition = $${idx++}`); values.push(JSON.stringify(d.condition)); }
    if (d.action !== undefined) { sets.push(`action = $${idx++}`); values.push(d.action); }
    if (d.notify_channels !== undefined) { sets.push(`notify_channels = $${idx++}`); values.push(JSON.stringify(d.notify_channels)); }
    if (d.is_active !== undefined) { sets.push(`is_active = $${idx++}`); values.push(d.is_active); }

    if (sets.length === 0) {
      return reply.code(400).send({ success: false, error: 'Güncellenecek alan belirtilmedi' });
    }

    sets.push(`updated_at = NOW()`);
    values.push(id);

    const [updated] = await query<AlertRule>(
      `UPDATE alert_rules SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );

    if (!updated) {
      return reply.code(404).send({ success: false, error: 'Kural bulunamadı' });
    }

    await logAudit(req, 'update_alert_rule', 'alert_rules', id);

    return reply.send({ success: true, data: updated });
  });

  // ─── DELETE /api/alert-rules/:id ──────────────────────────
  fastify.delete('/:id', { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const [deleted] = await query<{ id: string }>(
      `DELETE FROM alert_rules WHERE id = $1 RETURNING id`,
      [id],
    );

    if (!deleted) {
      return reply.code(404).send({ success: false, error: 'Kural bulunamadı' });
    }

    await logAudit(req, 'delete_alert_rule', 'alert_rules', id);

    return reply.send({ success: true, message: 'Kural silindi' });
  });

  // ─── PATCH /api/alert-rules/:id/toggle ────────────────────
  fastify.patch('/:id/toggle', { preHandler }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const [toggled] = await query<AlertRule>(
      `UPDATE alert_rules
       SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id],
    );

    if (!toggled) {
      return reply.code(404).send({ success: false, error: 'Kural bulunamadı' });
    }

    await logAudit(req, 'toggle_alert_rule', 'alert_rules', id, {
      is_active: toggled.is_active,
    });

    return reply.send({ success: true, data: toggled });
  });
}
