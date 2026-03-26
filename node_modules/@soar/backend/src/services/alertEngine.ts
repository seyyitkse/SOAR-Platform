import { query } from '../db/pool';
import { cacheGet, cacheSet } from '../db/redis';
import { getQueue } from '../workers/queue';
import { AlertRule, NormalizedEvent, NotificationJobData } from '../types';
import logger from '../utils/logger';

const RULES_CACHE_KEY = 'alert_rules:active';
const RULES_CACHE_TTL = 30; // saniye

async function getActiveRules(): Promise<AlertRule[]> {
  const cached = await cacheGet<AlertRule[]>(RULES_CACHE_KEY);
  if (cached) return cached;

  const rules = await query<AlertRule>(
    `SELECT * FROM alert_rules WHERE is_active = true`,
  );

  await cacheSet(RULES_CACHE_KEY, rules, RULES_CACHE_TTL);
  return rules;
}

export async function evaluateAlertRules(event: NormalizedEvent, eventId: string): Promise<void> {
  let rules: AlertRule[];
  try {
    rules = await getActiveRules();
  } catch (err) {
    logger.error('[AlertEngine] Kural listesi alınamadı', { error: (err as Error).message });
    return;
  }

  const queue = getQueue('notification_dispatcher');

  for (const rule of rules) {
    try {
      // Koşul 1: Severity eşiği
      if (event.severity < rule.severity_threshold) continue;

      // Koşul 2: Entegrasyon filtresi (null = hepsi)
      if (rule.integration_name !== null && rule.integration_name !== event.integration_name) continue;

      // Koşul 3: Olay tipi filtresi (null = hepsi)
      if (rule.event_type !== null && rule.event_type !== event.event_type) continue;

      // Aksiyon: notify veya notify_and_log
      if (rule.action === 'log') continue;
      if (rule.notify_channels.length === 0) continue;

      const jobData: NotificationJobData = {
        eventId,
        ruleId: rule.id,
        ruleName: rule.name,
        channels: rule.notify_channels,
        eventTitle: event.title,
        eventSeverity: event.severity,
        eventType: event.event_type,
        integrationName: event.integration_name,
        sourceIp: event.source_ip ?? null,
        destIp: event.dest_ip ?? null,
        time: event.time.toISOString(),
      };

      await queue.add('send_notification', jobData, {
        jobId: `notif-${eventId}-${rule.id}`,
      });

      logger.info('[AlertEngine] Bildirim kuyruğa eklendi', {
        rule: rule.name,
        event: event.title,
        channels: rule.notify_channels,
      });
    } catch (err) {
      // Bir kuralın hatası diğerlerini durdurmaz
      logger.error('[AlertEngine] Kural değerlendirme hatası', {
        ruleId: rule.id,
        error: (err as Error).message,
      });
    }
  }
}

// Alert kuralı değiştiğinde cache'i temizle
export async function invalidateRulesCache(): Promise<void> {
  try {
    const redis = (await import('../db/redis')).getRedis();
    await redis.del(RULES_CACHE_KEY);
  } catch {
    // Sessizce geç
  }
}
