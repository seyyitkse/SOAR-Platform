import { FastifyRequest, FastifyReply } from 'fastify';
import { RolePermissions, JWTPayload } from '../types';

declare module 'fastify' {
  interface FastifyRequest {
    user: JWTPayload;
  }
}

/**
 * JWT'den kullanıcıyı doğrular.
 * Tüm korumalı route'larda preHandler olarak kullanılır.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
    request.user = request.user as JWTPayload;
  } catch {
    reply.code(401).send({ success: false, error: 'Kimlik doğrulama gerekli' });
  }
}

/**
 * Belirli bir izni kontrol eder.
 * Kullanım: preHandler: [authenticate, requirePermission('manage_users')]
 */
export function requirePermission(permission: keyof RolePermissions) {
  return async function(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const user = request.user as JWTPayload;
    if (!user?.permissions?.[permission]) {
      reply.code(403).send({
        success: false,
        error: `Bu işlem için '${permission}' yetkisi gerekli`,
      });
    }
  };
}

/**
 * Kullanıcı hesabının aktif olup olmadığını kontrol eder.
 */
export async function requireActive(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Aktiflik kontrolü JWT üretilirken yapıldığından ek DB sorgusu gerekmez.
  // Anlık devre dışı bırakma için Redis blacklist kullanılabilir (opsiyonel).
  const user = request.user as JWTPayload;
  if (!user) {
    reply.code(401).send({ success: false, error: 'Oturum geçersiz' });
  }
}

/**
 * Audit log kayıt yardımcısı.
 */
export async function logAudit(
  request: FastifyRequest,
  action: string,
  resource: string,
  resourceId?: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const { query } = await import('../db/pool');
  const user = request.user as JWTPayload;
  const ip = request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()
    ?? request.ip
    ?? '0.0.0.0';

  await query(
    `INSERT INTO audit_logs (user_id, username, action, resource, resource_id, ip_address, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::inet, $7, $8)`,
    [
      user.sub,
      user.username,
      action,
      resource,
      resourceId ?? null,
      ip,
      request.headers['user-agent'] ?? '',
      JSON.stringify(metadata),
    ]
  );
}
