import { Job } from 'bullmq';
import IORedis from 'ioredis';
import axios from 'axios';
import { getQueue, getWorker } from '../queue';
import { query, queryOne } from '../../db/pool';
import { cacheGet, cacheSet } from '../../db/redis';
import { decryptApiKey } from '../../utils/crypto';
import { normalizeFortiMail } from '../../services/normalizer';
import { Integration, NormalizedEvent } from '../../types';
import logger from '../../utils/logger';

interface FortiMailJobData {
  integrationId?: string;
  isTest?: boolean;
}

const SESSION_CACHE_KEY = 'fortimail:session_token';
const SESSION_TTL = 3600; // 1 saat

async function processorFortiMail(job: Job<FortiMailJobData>): Promise<void> {
  const { isTest } = job.data;

  const integration = await queryOne<Integration>(
    `SELECT * FROM integrations WHERE name = 'fortimail' AND status IN ('active', 'syncing')`,
  );

  if (!integration) {
    logger.warn('[FortiMail] Aktif entegrasyon bulunamadı');
    return;
  }

  await query(`UPDATE integrations SET status = 'syncing', updated_at = NOW() WHERE id = $1`, [
    integration.id,
  ]);

  try {
    const apiKeyRow = await queryOne<{ key_hash: string }>(
      `SELECT key_hash FROM api_keys WHERE integration_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [integration.id],
    );

    if (!apiKeyRow) throw new Error('API anahtarı bulunamadı');
    const credentials = decryptApiKey(apiKeyRow.key_hash);

    // credentials formatı: "username:password" olarak beklenir
    const [username, password] = credentials.includes(':')
      ? [credentials.split(':')[0], credentials.split(':').slice(1).join(':')]
      : [credentials, ''];

    // Session token al (cache'den veya login ile)
    const sessionToken = await getSessionToken(integration.base_url, username, password);

    if (isTest) {
      // Bağlantı test — session token alabildiyse başarılı
      await query(
        `UPDATE integrations SET status = 'active', error_message = NULL, updated_at = NOW() WHERE id = $1`,
        [integration.id],
      );
      logger.info('[FortiMail] Bağlantı testi başarılı');
      return;
    }

    // Logları çek
    const logs = await fetchLogs(integration.base_url, sessionToken);
    logger.info(`[FortiMail] ${logs.length} log çekildi`);

    let insertedCount = 0;
    for (const rawLog of logs) {
      const event: NormalizedEvent = normalizeFortiMail(rawLog, integration.id);
      await query(
        `INSERT INTO security_events
          (time, integration_id, integration_name, source_ip, dest_ip, source_host, dest_host,
           severity, event_type, title, description, raw_payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT DO NOTHING`,
        [
          event.time,
          event.integration_id,
          event.integration_name,
          event.source_ip ?? null,
          event.dest_ip ?? null,
          event.source_host ?? null,
          event.dest_host ?? null,
          event.severity,
          event.event_type,
          event.title,
          event.description,
          JSON.stringify(event.raw_payload),
        ],
      );
      insertedCount++;
    }

    await query(
      `UPDATE integrations SET status = 'active', last_sync_at = NOW(), error_message = NULL, updated_at = NOW() WHERE id = $1`,
      [integration.id],
    );

    logger.info(`[FortiMail] Sync tamamlandı. ${insertedCount} event işlendi`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    await query(
      `UPDATE integrations SET status = 'error', error_message = $1, updated_at = NOW() WHERE id = $2`,
      [message, integration.id],
    );
    logger.error('[FortiMail] Sync hatası', { error: message });
    throw err;
  }
}

// ─── FortiMail API ───────────────────────────────────────────────────────────

async function getSessionToken(
  baseUrl: string,
  username: string,
  password: string,
): Promise<string> {
  // Önce cache'den kontrol
  const cached = await cacheGet<string>(SESSION_CACHE_KEY);
  if (cached) return cached;

  // Login endpoint'ten session token al
  const response = await axios.post(
    `${baseUrl}/api/v1/AdminLogin`,
    { name: username, password },
    { timeout: 15000 },
  );

  const token =
    response.data?.session_token ??
    response.data?.token ??
    response.headers['set-cookie']?.[0]?.split('=')?.[1]?.split(';')?.[0];

  if (!token) throw new Error('FortiMail session token alınamadı');

  // Redis'e cache'le
  await cacheSet(SESSION_CACHE_KEY, token, SESSION_TTL);

  return token;
}

async function fetchLogs(
  baseUrl: string,
  sessionToken: string,
): Promise<Record<string, unknown>[]> {
  const response = await axios.get(
    `${baseUrl}/api/v1/Monitor/Log/query`,
    {
      params: {
        log_type: 'history',
        time_period: 'last_hour',
      },
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        Cookie: `APSCOOKIE_${sessionToken}`,
      },
      timeout: 30000,
    },
  );

  const logs = response.data?.results ?? response.data?.data ?? response.data ?? [];
  return Array.isArray(logs) ? logs : [];
}

// ─── Worker Kaydı ────────────────────────────────────────────────────────────

export function registerFortiMailWorker(connection: IORedis): void {
  const worker = getWorker('fortimail_collector', processorFortiMail);

  (async () => {
    try {
      const integration = await queryOne<Integration>(
        `SELECT poll_interval_sec FROM integrations WHERE name = 'fortimail' AND status = 'active'`,
      );
      if (integration) {
        const queue = getQueue('fortimail_collector');
        await queue.add(
          'scheduled_collect',
          {},
          {
            repeat: { every: integration.poll_interval_sec * 1000 },
            jobId: 'fortimail_scheduled',
          },
        );
        logger.info(`[FortiMail] Repeatable job kayıt edildi (her ${integration.poll_interval_sec}s)`);
      }
    } catch (err) {
      logger.error('[FortiMail] Repeatable job kayıt hatası', { error: (err as Error).message });
    }
  })();

  logger.info('[FortiMail] Worker başlatıldı');
}
