import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import fs from 'fs';
import { query, queryOne } from '../db/pool';
import { authenticate, requirePermission, logAudit } from '../middleware/auth';
import { getQueue } from '../workers/queue';
import { Report } from '../types';

const generateSchema = z.object({
  type: z.enum(['daily', 'weekly', 'monthly']),
  targetRole: z.enum(['c_level', 'analyst', 'all']).default('all'),
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function reportsRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /api/reports ─────────────────────────────────────
  fastify.get('/', {
    preHandler: [authenticate, requirePermission('view_reports')],
  }, async (req, reply) => {
    const parse = listSchema.safeParse(req.query);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: parse.error.errors[0].message });
    }

    const { page, limit } = parse.data;
    const offset = (page - 1) * limit;

    const [reports, countRows] = await Promise.all([
      query<Report>(
        `SELECT * FROM reports ORDER BY generated_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset],
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM reports`,
      ),
    ]);

    const total = parseInt(countRows[0]?.count ?? '0', 10);

    return reply.send({
      success: true,
      data: reports,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  });

  // ─── POST /api/reports/generate ───────────────────────────
  fastify.post('/generate', {
    preHandler: [authenticate, requirePermission('generate_reports')],
  }, async (req, reply) => {
    const parse = generateSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: parse.error.errors[0].message });
    }

    const { type, targetRole } = parse.data;

    // Donem hesapla
    const now = new Date();
    let periodStart: Date;
    if (type === 'daily') {
      periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (type === 'weekly') {
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const reportQueue = getQueue('report_generator');
    const job = await reportQueue.add('generate', {
      type,
      targetRole,
      periodStart: periodStart.toISOString(),
      periodEnd: now.toISOString(),
      generatedBy: req.user.sub,
    });

    await logAudit(req, 'generate_report', 'reports', undefined, { type, targetRole });

    return reply.send({
      success: true,
      data: { jobId: job.id },
      message: 'Rapor oluşturma kuyruğa eklendi',
    });
  });

  // ─── GET /api/reports/:id/download ────────────────────────
  fastify.get('/:id/download', {
    preHandler: [authenticate, requirePermission('view_reports')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const report = await queryOne<Report>(
      `SELECT * FROM reports WHERE id = $1`,
      [id],
    );

    if (!report) {
      return reply.code(404).send({ success: false, error: 'Rapor bulunamadı' });
    }

    if (!report.pdf_path || !fs.existsSync(report.pdf_path)) {
      return reply.code(404).send({ success: false, error: 'PDF dosyası bulunamadı' });
    }

    const stream = fs.createReadStream(report.pdf_path);
    const filename = `soar_${report.type}_${report.id}.pdf`;

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(stream);
  });

  // ─── DELETE /api/reports/:id ──────────────────────────────
  fastify.delete('/:id', {
    preHandler: [authenticate, requirePermission('generate_reports')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const report = await queryOne<Report>(
      `SELECT * FROM reports WHERE id = $1`,
      [id],
    );

    if (!report) {
      return reply.code(404).send({ success: false, error: 'Rapor bulunamadı' });
    }

    // PDF dosyasini sil
    if (report.pdf_path && fs.existsSync(report.pdf_path)) {
      fs.unlinkSync(report.pdf_path);
    }

    await query(`DELETE FROM reports WHERE id = $1`, [id]);

    await logAudit(req, 'delete_report', 'reports', id);

    return reply.send({ success: true, message: 'Rapor silindi' });
  });
}
