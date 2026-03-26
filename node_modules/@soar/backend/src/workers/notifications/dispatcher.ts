import { Job } from 'bullmq';
import IORedis from 'ioredis';
import { getWorker } from '../queue';
import { sendEmailNotification } from '../../services/emailService';
import { sendSlackNotification } from '../../services/slackService';
import { NotificationJobData, ParsedNotifyChannel } from '../../types';
import logger from '../../utils/logger';

function parseNotifyChannel(raw: string): ParsedNotifyChannel | null {
  if (!raw) return null;

  const colonIdx = raw.indexOf(':');
  if (colonIdx === -1) {
    logger.warn('[NotificationDispatcher] Geçersiz kanal formatı', { raw });
    return null;
  }

  const type = raw.slice(0, colonIdx).toLowerCase();
  const target = raw.slice(colonIdx + 1);

  if (!target) return null;

  if (type === 'email' || type === 'slack') {
    return { type, target };
  }

  logger.warn('[NotificationDispatcher] Bilinmeyen kanal tipi', { type, raw });
  return { type: 'unknown', target };
}

async function processNotification(job: Job<NotificationJobData>): Promise<void> {
  const { channels, ruleName, eventTitle, eventSeverity } = job.data;

  logger.info('[NotificationDispatcher] Bildirim işleniyor', {
    rule: ruleName,
    event: eventTitle,
    severity: eventSeverity,
    channelCount: channels.length,
  });

  const errors: Error[] = [];

  for (const rawChannel of channels) {
    const parsed = parseNotifyChannel(rawChannel);
    if (!parsed || parsed.type === 'unknown') continue;

    try {
      if (parsed.type === 'email') {
        await sendEmailNotification(parsed.target, job.data);
      } else if (parsed.type === 'slack') {
        await sendSlackNotification(parsed.target, job.data);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('[NotificationDispatcher] Kanal gönderim hatası', {
        channel: rawChannel,
        error: error.message,
      });
      errors.push(error);
    }
  }

  // Herhangi bir kanal başarısız olduysa BullMQ retry mekanizmasını tetikle
  if (errors.length > 0) {
    throw new Error(
      `${errors.length} kanal(lar) başarısız: ${errors.map((e) => e.message).join('; ')}`,
    );
  }
}

export function registerNotificationWorker(_connection: IORedis): void {
  getWorker('notification_dispatcher', processNotification, { concurrency: 5 });
  logger.info('[NotificationWorker] Worker başlatıldı');
}
