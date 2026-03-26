import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { authenticate, requirePermission, logAudit } from '../middleware/auth';
import { encryptApiKey, decryptApiKey } from '../utils/crypto';
import { Integration, ApiKey } from '../types';
import { getQueue } from '../workers/queue';
import logger from '../utils/logger';

const updateIntegrationSchema = z.object({
  base_url: z.string().url().optional(),
  poll_interval_sec: z.number().int().min(30).max(86400).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  config: z.record(z.unknown()).optional(),
});

const createApiKeySchema = z.object({
  key_name: z.string().min(1).max(100),
  key_value: z.string().min(1),
  expires_at: z.string().datetime().optional(),
});

export async function integrationsRoutes(fastify: FastifyInstance): Promise<void> {
  const preHandlerView   = [authenticate, requirePermission('view_security_events')];
  const preHandlerManage = [authenticate, requirePermission('manage_integrations')];
  const preHandlerKeys   = [authenticate, requirePermission('manage_api_keys')];

  // ─── GET /api/integrations ───────────────────────────────
  fastify.get('/', { preHandler: preHandlerView }, async (_req, reply) => {
    const integrations = await query<Integration>(
      `SELECT id, name, display_name, base_url, poll_interval_sec,
              status, last_sync_at, error_message, config, created_at, updated_at
       FROM integrations
       ORDER BY display_name`
    );
    return reply.send({ success: true, data: integrations });
  });

  // ─── GET /api/integrations/:id ───────────────────────────
  fastify.get('/:id', { preHandler: preHandlerView }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const integration = await queryOne<Integration>(
      'SELECT * FROM integrations WHERE id = $1',
      [id]
    );
    if (!integration) {
      return reply.code(404).send({ success: false, error: 'Entegrasyon bulunamadı' });
    }
    return reply.send({ success: true, data: integration });
  });

  // ─── PUT /api/integrations/:id ───────────────────────────
  fastify.put('/:id', { preHandler: preHandlerManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = updateIntegrationSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: parse.error.errors[0].message });
    }

    const { base_url, poll_interval_sec, status, config } = parse.data;
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (base_url)            { fields.push(`base_url = $${idx++}`);            values.push(base_url); }
    if (poll_interval_sec)   { fields.push(`poll_interval_sec = $${idx++}`);   values.push(poll_interval_sec); }
    if (status)              { fields.push(`status = $${idx++}`);              values.push(status); }
    if (config)              { fields.push(`config = $${idx++}`);              values.push(JSON.stringify(config)); }
    fields.push(`updated_at = NOW()`);
    values.push(id);

    if (fields.length === 1) {
      return reply.code(400).send({ success: false, error: 'Güncellenecek alan yok' });
    }

    const [updated] = await query<Integration>(
      `UPDATE integrations SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (!updated) return reply.code(404).send({ success: false, error: 'Entegrasyon bulunamadı' });

    await logAudit(req, 'update_integration', 'integrations', id, { changes: Object.keys(parse.data) });

    return reply.send({ success: true, data: updated });
  });

  // ─── POST /api/integrations/:id/test ─────────────────────
  fastify.post('/:id/test', { preHandler: preHandlerManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const integration = await queryOne<Integration>(
      'SELECT * FROM integrations WHERE id = $1',
      [id]
    );
    if (!integration) {
      return reply.code(404).send({ success: false, error: 'Entegrasyon bulunamadı' });
    }

    // Test job'ı kuyruğa ekle
    const queue = getQueue(`${integration.name}_collector`);
    await queue.add('test_connection', { integrationId: id, isTest: true }, {
      attempts: 1,
      removeOnComplete: true,
    });

    return reply.send({ success: true, message: 'Bağlantı testi başlatıldı' });
  });

  // ─── POST /api/integrations/:id/sync ─────────────────────
  // Manuel veri çekmeyi tetikler
  fastify.post('/:id/sync', { preHandler: preHandlerManage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const integration = await queryOne<Integration>(
      "SELECT * FROM integrations WHERE id = $1 AND status = 'active'",
      [id]
    );
    if (!integration) {
      return reply.code(400).send({
        success: false,
        error: 'Entegrasyon bulunamadı veya aktif değil',
      });
    }

    const queue = getQueue(`${integration.name}_collector`);
    await queue.add('manual_collect', { integrationId: id }, {
      attempts: 3,
      priority: 1, // Yüksek öncelik
    });

    await logAudit(req, 'manual_sync', 'integrations', id);

    return reply.send({ success: true, message: 'Manuel senkronizasyon başlatıldı' });
  });

  // ─── GET /api/integrations/:id/api-keys ──────────────────
  fastify.get('/:id/api-keys', { preHandler: preHandlerKeys }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const keys = await query<Omit<ApiKey, 'key_hash'>>(
      `SELECT id, integration_id, key_name, expires_at, last_used_at, created_by, created_at
       FROM api_keys WHERE integration_id = $1 ORDER BY created_at DESC`,
      [id]
    );
    // key_hash asla istemciye gönderilmez
    return reply.send({ success: true, data: keys });
  });

  // ─── POST /api/integrations/:id/api-keys ─────────────────
  fastify.post('/:id/api-keys', { preHandler: preHandlerKeys }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = createApiKeySchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: parse.error.errors[0].message });
    }
    const { key_name, key_value, expires_at } = parse.data;

    // AES-256 ile şifrele
    const keyHash = encryptApiKey(key_value);

    const [apiKey] = await query<{ id: string; key_name: string }>(
      `INSERT INTO api_keys (integration_id, key_name, key_hash, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, key_name`,
      [id, key_name, keyHash, expires_at ?? null, req.user.sub]
    );

    await logAudit(req, 'create_api_key', 'api_keys', apiKey.id, { key_name, integration_id: id });

    return reply.code(201).send({
      success: true,
      data: apiKey,
      message: 'API anahtarı oluşturuldu. Değer güvenli şekilde saklandı.',
    });
  });

  // ─── DELETE /api/integrations/:integrationId/api-keys/:keyId ─
  fastify.delete('/:integrationId/api-keys/:keyId', {
    preHandler: preHandlerKeys,
  }, async (req, reply) => {
    const { integrationId, keyId } = req.params as { integrationId: string; keyId: string };

    const [deleted] = await query<{ id: string }>(
      'DELETE FROM api_keys WHERE id = $1 AND integration_id = $2 RETURNING id',
      [keyId, integrationId]
    );

    if (!deleted) return reply.code(404).send({ success: false, error: 'API anahtarı bulunamadı' });

    await logAudit(req, 'delete_api_key', 'api_keys', keyId);

    return reply.send({ success: true, message: 'API anahtarı silindi' });
  });

  // ─── GET /api/integrations/status ────────────────────────
  // Tüm entegrasyonların anlık durumu
  fastify.get('/summary/status', { preHandler: preHandlerView }, async (_req, reply) => {
    const rows = await query(`
      SELECT
        i.id, i.name, i.display_name, i.status,
        i.last_sync_at, i.error_message,
        COUNT(se.id) FILTER (WHERE se.time > NOW() - INTERVAL '24 hours') as events_24h
      FROM integrations i
      LEFT JOIN security_events se ON se.integration_id = i.id
      GROUP BY i.id
      ORDER BY i.display_name
    `);
    return reply.send({ success: true, data: rows });
  });
}
