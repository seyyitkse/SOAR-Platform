import { Job } from 'bullmq';
import IORedis from 'ioredis';
import axios from 'axios';
import { getQueue, getWorker } from '../queue';
import { query, queryOne } from '../../db/pool';
import { decryptApiKey } from '../../utils/crypto';
import { HashType, VTVerdict, Integration } from '../../types';
import logger from '../../utils/logger';

interface VTJobData {
  hash: string;
  hashType: HashType;
  userId: string;
}

// ─── Worker Processor ────────────────────────────────────────────────────────

async function processVirusTotal(job: Job<VTJobData>): Promise<void> {
  const { hash, hashType, userId } = job.data;

  // 1. Önce 24 saatten yeni cache kontrol et
  const cached = await queryOne<{ id: string; verdict: VTVerdict }>(
    `SELECT id, verdict FROM vt_scans
     WHERE hash = $1 AND scanned_at > NOW() - INTERVAL '24 hours'
     LIMIT 1`,
    [hash],
  );

  if (cached) {
    logger.info(`[VirusTotal] Hash ${hash} cache'den döndürüldü (verdict: ${cached.verdict})`);
    // WebSocket ile sonucu bildir
    try {
      const { sendToUser } = await import('../../services/websocket');
      const scan = await queryOne(
        `SELECT * FROM vt_scans WHERE id = $1`,
        [cached.id],
      );
      sendToUser(userId, 'vt_result', scan);
    } catch {
      // WebSocket henüz başlatılmamışsa sessizce geç
    }
    return;
  }

  // 2. VT API key'i al
  const integration = await queryOne<Integration>(
    `SELECT * FROM integrations WHERE name = 'virustotal' AND status IN ('active', 'syncing')`,
  );

  if (!integration) {
    throw new Error('VirusTotal entegrasyonu aktif değil');
  }

  const apiKeyRow = await queryOne<{ key_hash: string }>(
    `SELECT key_hash FROM api_keys WHERE integration_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [integration.id],
  );

  if (!apiKeyRow) throw new Error('VirusTotal API anahtarı bulunamadı');
  const apiKey = decryptApiKey(apiKeyRow.key_hash);

  // 3. VT API'ye GET isteği
  const response = await axios.get(
    `https://www.virustotal.com/api/v3/files/${hash}`,
    {
      headers: { 'x-apikey': apiKey },
      timeout: 30000,
      validateStatus: (status) => status < 500,
    },
  );

  if (response.status === 404) {
    // Hash bulunamadı
    await query(
      `INSERT INTO vt_scans (hash, hash_type, malicious_count, suspicious_count, harmless_count,
         undetected_count, total_engines, verdict, file_name, file_type, file_size,
         raw_response, scanned_by, scanned_at)
       VALUES ($1, $2, 0, 0, 0, 0, 0, 'unknown', NULL, NULL, NULL, $3, $4, NOW())
       ON CONFLICT (hash) DO UPDATE SET
         verdict = 'unknown', raw_response = $3, scanned_by = $4, scanned_at = NOW()`,
      [hash, hashType, JSON.stringify({ status: 'not_found' }), userId],
    );

    try {
      const { sendToUser } = await import('../../services/websocket');
      const scan = await queryOne(`SELECT * FROM vt_scans WHERE hash = $1`, [hash]);
      sendToUser(userId, 'vt_result', scan);
    } catch { /* WebSocket opsiyonel */ }
    return;
  }

  if (response.status !== 200) {
    throw new Error(`VirusTotal API hatası: ${response.status} ${response.statusText}`);
  }

  // 4. Yanıtı parse et
  const data = response.data?.data;
  const attrs = data?.attributes ?? {};
  const stats = attrs.last_analysis_stats ?? {};

  const maliciousCount = Number(stats.malicious) || 0;
  const suspiciousCount = Number(stats.suspicious) || 0;
  const harmlessCount = Number(stats.harmless) || 0;
  const undetectedCount = Number(stats.undetected) || 0;
  const totalEngines = maliciousCount + suspiciousCount + harmlessCount + undetectedCount;

  // 5. Verdict belirle
  let verdict: VTVerdict = 'unknown';
  if (maliciousCount >= 3) {
    verdict = 'malicious';
  } else if (suspiciousCount >= 3) {
    verdict = 'suspicious';
  } else if (maliciousCount === 0 && suspiciousCount === 0) {
    verdict = 'clean';
  }

  const fileName = attrs.meaningful_name ?? attrs.names?.[0] ?? null;
  const fileType = attrs.type_description ?? null;
  const fileSize = attrs.size ?? null;

  // 6. vt_scans tablosuna kaydet
  await query(
    `INSERT INTO vt_scans (hash, hash_type, malicious_count, suspicious_count, harmless_count,
       undetected_count, total_engines, verdict, file_name, file_type, file_size,
       raw_response, scanned_by, scanned_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
     ON CONFLICT (hash) DO UPDATE SET
       hash_type = $2, malicious_count = $3, suspicious_count = $4, harmless_count = $5,
       undetected_count = $6, total_engines = $7, verdict = $8, file_name = $9,
       file_type = $10, file_size = $11, raw_response = $12, scanned_by = $13, scanned_at = NOW()`,
    [
      hash, hashType, maliciousCount, suspiciousCount, harmlessCount,
      undetectedCount, totalEngines, verdict, fileName, fileType, fileSize,
      JSON.stringify(response.data), userId,
    ],
  );

  logger.info(`[VirusTotal] Hash ${hash} tarandı → verdict: ${verdict} (${maliciousCount}/${totalEngines})`);

  // 7. WebSocket ile sonucu bildir
  try {
    const { sendToUser } = await import('../../services/websocket');
    const scan = await queryOne(`SELECT * FROM vt_scans WHERE hash = $1`, [hash]);
    sendToUser(userId, 'vt_result', scan);
  } catch { /* WebSocket opsiyonel */ }
}

// ─── Worker Kaydı ────────────────────────────────────────────────────────────

export function registerVirusTotalWorker(connection: IORedis): void {
  getWorker('virustotal_scanner', processVirusTotal, {
    limiter: {
      max: 4,
      duration: 60000,
    },
  });

  logger.info('[VirusTotal] Worker başlatıldı (rate limit: 4 req/dk)');
}

// ─── Job Ekleme Yardımcısı ──────────────────────────────────────────────────

export async function scanHash(
  hash: string,
  hashType: HashType,
  userId: string,
): Promise<string> {
  const queue = getQueue('virustotal_scanner');
  const job = await queue.add('scan', { hash, hashType, userId });
  return job.id!;
}
