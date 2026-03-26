import IORedis from 'ioredis';
import logger from '../utils/logger';

let redis: IORedis;

export function getRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy(times) {
        if (times > 10) return null;
        return Math.min(times * 100, 3000);
      },
    });

    redis.on('connect', () => logger.info('Redis bağlantısı kuruldu'));
    redis.on('error', (err) => logger.error('Redis hatası', { error: err.message }));
    redis.on('reconnecting', () => logger.warn('Redis yeniden bağlanıyor...'));
  }
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) await redis.quit();
}

// Cache yardımcıları
export async function cacheGet<T>(key: string): Promise<T | null> {
  const val = await getRedis().get(key);
  if (!val) return null;
  try { return JSON.parse(val); } catch { return null; }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  await getRedis().setex(key, ttlSeconds, JSON.stringify(value));
}

export async function cacheDel(key: string): Promise<void> {
  await getRedis().del(key);
}
