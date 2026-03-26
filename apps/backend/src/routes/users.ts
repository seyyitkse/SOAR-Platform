import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { authenticate, requirePermission, logAudit } from '../middleware/auth';
import { User } from '../types';

const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8, 'Şifre en az 8 karakter'),
  role_id: z.string().uuid(),
});

const updateUserSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role_id: z.string().uuid().optional(),
  is_active: z.boolean().optional(),
});

export async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  const preHandlerBase = [authenticate, requirePermission('manage_users')];

  // ─── GET /api/users ──────────────────────────────────────
  fastify.get('/', { preHandler: preHandlerBase }, async (req, reply) => {
    const page = Number((req.query as Record<string, string>).page ?? 1);
    const limit = Number((req.query as Record<string, string>).limit ?? 20);
    const offset = (page - 1) * limit;

    const [users, countResult] = await Promise.all([
      query<User & { role_name: string; role_display_name: string }>(
        `SELECT u.id, u.username, u.email, u.is_active, u.last_login, u.created_at,
                r.name as role_name, r.display_name as role_display_name
         FROM users u
         JOIN roles r ON u.role_id = r.id
         ORDER BY u.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query<{ count: string }>('SELECT COUNT(*)::text as count FROM users'),
    ]);

    return reply.send({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total: parseInt(countResult[0].count, 10),
        total_pages: Math.ceil(parseInt(countResult[0].count, 10) / limit),
      },
    });
  });

  // ─── POST /api/users ─────────────────────────────────────
  fastify.post('/', { preHandler: preHandlerBase }, async (req, reply) => {
    const parse = createUserSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: parse.error.errors[0].message });
    }
    const { username, email, password, role_id } = parse.data;

    const exists = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase(), username]
    );
    if (exists) {
      return reply.code(409).send({ success: false, error: 'E-posta veya kullanıcı adı zaten mevcut' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await query<User>(
      `INSERT INTO users (username, email, password_hash, role_id)
       VALUES ($1, $2, $3, $4) RETURNING id, username, email, is_active, created_at`,
      [username, email.toLowerCase(), passwordHash, role_id]
    );

    await logAudit(req, 'create_user', 'users', user.id, { username, email });

    return reply.code(201).send({ success: true, data: user });
  });

  // ─── PUT /api/users/:id ──────────────────────────────────
  fastify.put('/:id', { preHandler: preHandlerBase }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parse = updateUserSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: parse.error.errors[0].message });
    }

    const updates = parse.data;
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.username) { fields.push(`username = $${idx++}`); values.push(updates.username); }
    if (updates.email)    { fields.push(`email = $${idx++}`);    values.push(updates.email.toLowerCase()); }
    if (updates.role_id)  { fields.push(`role_id = $${idx++}`);  values.push(updates.role_id); }
    if (updates.is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(updates.is_active); }
    if (updates.password) {
      const hash = await bcrypt.hash(updates.password, 12);
      fields.push(`password_hash = $${idx++}`);
      values.push(hash);
    }
    fields.push(`updated_at = NOW()`);
    values.push(id);

    if (fields.length === 1) {
      return reply.code(400).send({ success: false, error: 'Güncellenecek alan bulunamadı' });
    }

    const [updated] = await query<User>(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, username, email, is_active`,
      values
    );

    if (!updated) return reply.code(404).send({ success: false, error: 'Kullanıcı bulunamadı' });

    await logAudit(req, 'update_user', 'users', id, { changes: Object.keys(updates) });

    return reply.send({ success: true, data: updated });
  });

  // ─── DELETE /api/users/:id ───────────────────────────────
  fastify.delete('/:id', { preHandler: preHandlerBase }, async (req, reply) => {
    const { id } = req.params as { id: string };

    // Kendi hesabını silemez
    if (req.user.sub === id) {
      return reply.code(400).send({ success: false, error: 'Kendi hesabınızı silemezsiniz' });
    }

    // Soft delete — is_active = false
    const [user] = await query<User>(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id, username',
      [id]
    );

    if (!user) return reply.code(404).send({ success: false, error: 'Kullanıcı bulunamadı' });

    await logAudit(req, 'deactivate_user', 'users', id, { username: user.username });

    return reply.send({ success: true, message: 'Kullanıcı devre dışı bırakıldı' });
  });

  // ─── GET /api/users/roles ────────────────────────────────
  fastify.get('/roles', { preHandler: [authenticate] }, async (_req, reply) => {
    const roles = await query(
      'SELECT id, name, display_name, permissions FROM roles ORDER BY name'
    );
    return reply.send({ success: true, data: roles });
  });
}
