import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { authenticate, requirePermission, logAudit } from '../middleware/auth';
import { scanHash } from '../workers/collectors/virustotal';
import { HashType, VTScan } from '../types';

function detectHashType(hash: string): HashType {
  const len = hash.length;
  if (len === 64) return 'sha256';
  if (len === 40) return 'sha1';
  if (len === 32) return 'md5';
  throw new Error(`Geçersiz hash uzunluğu: ${len} (beklenen: 32/40/64)`);
}

const scanSchema = z.object({
  hash: z.string().regex(/^[a-fA-F0-9]{32,64}$/, 'Geçersiz hash formatı'),
  hashType: z.enum(['sha256', 'md5', 'sha1']).optional(),
});

const historySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function virusTotalRoutes(fastify: FastifyInstance): Promise<void> {
  const preHandler = [authenticate, requirePermission('trigger_virustotal')];

  // ─── POST /api/virustotal/scan ────────────────────────────
  fastify.post('/scan', { preHandler }, async (req, reply) => {
    const parse = scanSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: parse.error.errors[0].message });
    }

    const { hash } = parse.data;
    let hashType: HashType;

    try {
      hashType = parse.data.hashType ?? detectHashType(hash);
    } catch (err) {
      return reply.code(400).send({ success: false, error: (err as Error).message });
    }

    const jobId = await scanHash(hash, hashType, req.user.sub);

    await logAudit(req, 'virustotal_scan', 'vt_scans', hash, { hashType });

    return reply.send({
      success: true,
      data: { jobId, hash, hashType },
      message: 'Tarama kuyruğa eklendi',
    });
  });

  // ─── GET /api/virustotal/result/:hash ─────────────────────
  fastify.get('/result/:hash', { preHandler }, async (req, reply) => {
    const { hash } = req.params as { hash: string };

    const scan = await queryOne<VTScan>(
      `SELECT * FROM vt_scans WHERE hash = $1`,
      [hash],
    );

    if (!scan) {
      return reply.send({
        success: true,
        data: { status: 'pending', hash },
      });
    }

    return reply.send({ success: true, data: scan });
  });

  // ─── GET /api/virustotal/history ──────────────────────────
  fastify.get('/history', { preHandler }, async (req, reply) => {
    const parse = historySchema.safeParse(req.query);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: parse.error.errors[0].message });
    }

    const { page, limit } = parse.data;
    const offset = (page - 1) * limit;

    const [scans, countRows] = await Promise.all([
      query<VTScan>(
        `SELECT * FROM vt_scans ORDER BY scanned_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM vt_scans`,
      ),
    ]);

    const total = parseInt(countRows[0]?.count ?? '0', 10);

    return reply.send({
      success: true,
      data: scans,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  });

  // ─── DELETE /api/virustotal/:hash ─────────────────────────
  fastify.delete('/:hash', {
    preHandler: [authenticate, requirePermission('manage_integrations')],
  }, async (req, reply) => {
    const { hash } = req.params as { hash: string };

    const [deleted] = await query<{ hash: string }>(
      `DELETE FROM vt_scans WHERE hash = $1 RETURNING hash`,
      [hash],
    );

    if (!deleted) {
      return reply.code(404).send({ success: false, error: 'Tarama kaydı bulunamadı' });
    }

    await logAudit(req, 'delete_vt_scan', 'vt_scans', hash);

    return reply.send({ success: true, message: 'Tarama kaydı silindi' });
  });
}
