import { Job } from 'bullmq';
import IORedis from 'ioredis';
import crypto from 'crypto';
import axios from 'axios';
import { getQueue, getWorker } from '../queue';
import { query, queryOne } from '../../db/pool';
import { decryptApiKey } from '../../utils/crypto';
import { normalizeCortexXDR } from '../../services/normalizer';
import { Integration, NormalizedEvent } from '../../types';
import logger from '../../utils/logger';

interface CortexJobData {
  integrationId?: string;
  isTest?: boolean;
}

async function processCortexXDR(job: Job<CortexJobData>): Promise<void> {
  const { isTest } = job.data;

  // 1. Entegrasyonu bul
  const integration = await queryOne<Integration>(
    `SELECT * FROM integrations WHERE name = 'cortex_xdr' AND status IN ('active', 'syncing')`,
  );

  if (!integration) {
    logger.warn('[CortexXDR] Aktif entegrasyon bulunamadı');
    return;
  }

  // Syncing durumuna al
  await query(`UPDATE integrations SET status = 'syncing', updated_at = NOW() WHERE id = $1`, [
    integration.id,
  ]);

  try {
    // 2. API key'i al ve çöz
    const apiKeyRow = await queryOne<{ key_hash: string; key_name: string }>(
      `SELECT key_hash, key_name FROM api_keys WHERE integration_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [integration.id],
    );

    if (!apiKeyRow) {
      throw new Error('API anahtarı bulunamadı');
    }

    const apiKey = decryptApiKey(apiKeyRow.key_hash);

    // API key ID'yi config'den veya key_name'den al
    const apiKeyId = String(
      (integration.config as Record<string, unknown>)?.api_key_id ?? apiKeyRow.key_name,
    );

    // Test moduysa sadece bağlantıyı kontrol et
    if (isTest) {
      await testConnection(integration.base_url, apiKey, apiKeyId);
      await query(
        `UPDATE integrations SET status = 'active', error_message = NULL, updated_at = NOW() WHERE id = $1`,
        [integration.id],
      );
      logger.info('[CortexXDR] Bağlantı testi başarılı');
      return;
    }

    // 3. Son sync zamanından bu yana gelen alert'leri çek
    const lastSync = integration.last_sync_at
      ? new Date(integration.last_sync_at).getTime()
      : Date.now() - 24 * 60 * 60 * 1000; // İlk çalışmada son 24 saat

    const alerts = await fetchAlerts(integration.base_url, apiKey, apiKeyId, lastSync);
    logger.info(`[CortexXDR] ${alerts.length} alert çekildi`);

    // 4-5. Normalize et ve kaydet
    let insertedCount = 0;
    for (const rawAlert of alerts) {
      const event: NormalizedEvent = normalizeCortexXDR(rawAlert, integration.id);
      const result = await query(
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
      if (result) insertedCount++;
    }

    // 6. Sync zamanını güncelle
    await query(
      `UPDATE integrations
       SET status = 'active', last_sync_at = NOW(), error_message = NULL, updated_at = NOW()
       WHERE id = $1`,
      [integration.id],
    );

    logger.info(`[CortexXDR] Sync tamamlandı. ${insertedCount} yeni event kaydedildi`);
  } catch (err) {
    // 7. Hata durumunda güncelle
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    await query(
      `UPDATE integrations SET status = 'error', error_message = $1, updated_at = NOW() WHERE id = $2`,
      [message, integration.id],
    );
    logger.error('[CortexXDR] Sync hatası', { error: message });
    throw err;
  }
}

// ─── Cortex XDR API Auth ─────────────────────────────────────────────────────

function buildAuthHeaders(apiKey: string, apiKeyId: string): Record<string, string | number> {
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(64).toString('hex');
  const authString = `${apiKeyId}\n${nonce}\n${timestamp}`;
  const signature = crypto.createHmac('sha256', apiKey).update(authString).digest('hex');

  return {
    'x-xdr-auth-id': apiKeyId,
    'x-xdr-nonce': nonce,
    'x-xdr-timestamp': timestamp,
    'x-xdr-signature': signature,
    'Content-Type': 'application/json',
  };
}

async function fetchAlerts(
  baseUrl: string,
  apiKey: string,
  apiKeyId: string,
  sinceTimestamp: number,
): Promise<Record<string, unknown>[]> {
  const headers = buildAuthHeaders(apiKey, apiKeyId);

  const body = {
    request_data: {
      filters: [
        {
          field: 'creation_time',
          operator: 'gte',
          value: sinceTimestamp,
        },
      ],
      search_from: 0,
      search_to: 100,
      sort: { field: 'creation_time', keyword: 'desc' },
    },
  };

  const response = await axios.post(
    `${baseUrl}/public_api/v1/alerts/get_alerts_multi_events`,
    body,
    { headers, timeout: 30000 },
  );

  const alerts = response.data?.reply?.alerts ?? response.data?.reply ?? [];
  return Array.isArray(alerts) ? alerts : [];
}

async function testConnection(
  baseUrl: string,
  apiKey: string,
  apiKeyId: string,
): Promise<void> {
  const headers = buildAuthHeaders(apiKey, apiKeyId);
  await axios.post(
    `${baseUrl}/public_api/v1/alerts/get_alerts_multi_events`,
    { request_data: { filters: [], search_from: 0, search_to: 1 } },
    { headers, timeout: 15000 },
  );
}

// ─── Worker Kaydı ────────────────────────────────────────────────────────────

export function registerCortexXDRWorker(connection: IORedis): void {
  const worker = getWorker('cortex_xdr_collector', processCortexXDR);

  // Repeatable job olarak kaydet — poll interval'e göre
  (async () => {
    try {
      const integration = await queryOne<Integration>(
        `SELECT poll_interval_sec FROM integrations WHERE name = 'cortex_xdr' AND status = 'active'`,
      );
      if (integration) {
        const queue = getQueue('cortex_xdr_collector');
        await queue.add(
          'scheduled_collect',
          {},
          {
            repeat: {
              every: integration.poll_interval_sec * 1000,
            },
            jobId: 'cortex_xdr_scheduled',
          },
        );
        logger.info(
          `[CortexXDR] Repeatable job kayıt edildi (her ${integration.poll_interval_sec}s)`,
        );
      }
    } catch (err) {
      logger.error('[CortexXDR] Repeatable job kayıt hatası', {
        error: (err as Error).message,
      });
    }
  })();

  logger.info('[CortexXDR] Worker başlatıldı');
}
