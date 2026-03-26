import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, queryOne } from '../db/pool';
import { getRedis } from '../db/redis';
import { hashToken, generateSecureToken } from '../utils/crypto';
import { authenticate } from '../middleware/auth';
import { User, Role, JWTPayload } from '../types';
import logger from '../utils/logger';

const loginSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi girin'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // ─── POST /api/auth/login ────────────────────────────────
  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const parse = loginSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        success: false,
        error: parse.error.errors[0].message,
      });
    }
    const { email, password } = parse.data;

    // Kullanıcıyı bul
    const user = await queryOne<User & { role_name: string; permissions: Record<string, boolean> }>(
      `SELECT u.*, r.name as role_name, r.permissions
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    if (!user || !user.is_active) {
      // Zamanı sabit tut — timing attack'a karşı
      await bcrypt.compare('dummy', '$2a$12$dummyhashfordummypurposesonly123');
      return reply.code(401).send({
        success: false,
        error: 'E-posta veya şifre hatalı',
      });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      logger.warn('Başarısız giriş denemesi', { email, ip: request.ip });
      return reply.code(401).send({
        success: false,
        error: 'E-posta veya şifre hatalı',
      });
    }

    // JWT payload
    const payload: JWTPayload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role_name as JWTPayload['role'],
      permissions: user.permissions as JWTPayload['permissions'],
    };

    // Access token (15dk)
    const accessToken = fastify.jwt.sign(payload, {
      expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    });

    // Refresh token (7 gün) — veritabanında sadece hash saklanır
    const refreshToken = generateSecureToken(64);
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    // Son giriş zamanını güncelle
    await query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    logger.info('Başarılı giriş', { userId: user.id, username: user.username });

    return reply.code(200).send({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role_name,
          permissions: user.permissions,
        },
      },
    });
  });

  // ─── POST /api/auth/refresh ──────────────────────────────
  fastify.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const parse = refreshSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ success: false, error: 'Geçersiz token' });
    }

    const { refreshToken } = parse.data;
    const tokenHash = hashToken(refreshToken);

    const stored = await queryOne<{ user_id: string; expires_at: Date }>(
      `SELECT rt.user_id, rt.expires_at
       FROM refresh_tokens rt
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
      [tokenHash]
    );

    if (!stored) {
      return reply.code(401).send({
        success: false,
        error: 'Token geçersiz veya süresi dolmuş',
      });
    }

    const user = await queryOne<User & { role_name: string; permissions: Record<string, boolean> }>(
      `SELECT u.*, r.name as role_name, r.permissions
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1 AND u.is_active = true`,
      [stored.user_id]
    );

    if (!user) {
      return reply.code(401).send({ success: false, error: 'Kullanıcı bulunamadı' });
    }

    const payload: JWTPayload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role_name as JWTPayload['role'],
      permissions: user.permissions as JWTPayload['permissions'],
    };

    const newAccessToken = fastify.jwt.sign(payload, {
      expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    });

    return reply.code(200).send({
      success: true,
      data: { accessToken: newAccessToken },
    });
  });

  // ─── POST /api/auth/logout ───────────────────────────────
  fastify.post('/logout', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { refreshToken?: string };
    if (body?.refreshToken) {
      const tokenHash = hashToken(body.refreshToken);
      await query(
        'DELETE FROM refresh_tokens WHERE token_hash = $1',
        [tokenHash]
      );
    }

    // Kullanıcının tüm refresh token'larını temizle (opsiyonel — tam çıkış)
    // await query('DELETE FROM refresh_tokens WHERE user_id = $1', [request.user.sub]);

    return reply.code(200).send({ success: true, message: 'Çıkış yapıldı' });
  });

  // ─── GET /api/auth/me ────────────────────────────────────
  fastify.get('/me', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await queryOne<User & { role_name: string; permissions: Record<string, boolean> }>(
      `SELECT u.id, u.username, u.email, u.last_login, u.created_at,
              r.name as role_name, r.display_name as role_display_name, r.permissions
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1 AND u.is_active = true`,
      [request.user.sub]
    );

    if (!user) {
      return reply.code(404).send({ success: false, error: 'Kullanıcı bulunamadı' });
    }

    return reply.code(200).send({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role_name,
        roleDisplayName: (user as Record<string, unknown>).role_display_name,
        permissions: user.permissions,
        lastLogin: user.last_login,
        createdAt: user.created_at,
      },
    });
  });
}
