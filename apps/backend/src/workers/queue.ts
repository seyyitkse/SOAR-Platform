import { Queue, Worker, QueueEvents, Processor, WorkerOptions, Job } from 'bullmq';
import IORedis from 'ioredis';
import logger from '../utils/logger';

const queues = new Map<string, Queue>();
const workers = new Map<string, Worker>();
const queueEvents = new Map<string, QueueEvents>();

// Queue isimleri — tüm collector ve worker'lar için
export const QUEUE_NAMES = {
  CORTEX_XDR_COLLECTOR: 'cortex_xdr_collector',
  PANORAMA_COLLECTOR: 'panorama_collector',
  FORTIMAIL_COLLECTOR: 'fortimail_collector',
  ZABBIX_COLLECTOR: 'zabbix_collector',
  VIRUSTOTAL_SCANNER: 'virustotal_scanner',
  REPORT_GENERATOR: 'report_generator',
  NOTIFICATION_DISPATCHER: 'notification_dispatcher',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Varsayılan job ayarları — 3 deneme, exponential backoff (5s, 10s, 20s)
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
  removeOnComplete: {
    age: 24 * 3600, // 24 saat sonra sil
    count: 1000, // veya 1000 job'dan fazlasını sil
  },
  removeOnFail: {
    age: 7 * 24 * 3600, // 7 gün sonra sil
    count: 5000, // veya 5000 job'dan fazlasını sil
  },
};

/**
 * Queue instance'ı döner (singleton pattern)
 * Aynı queue adı için sadece bir instance oluşturulur
 */
export function getQueue(name: string): Queue {
  if (queues.has(name)) return queues.get(name)!;

  const connection = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  const queue = new Queue(name, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  // Queue event'lerini logla
  const events = new QueueEvents(name, { connection: connection.duplicate() });

  events.on('completed', ({ jobId, returnvalue }) => {
    logger.info(`[Queue:${name}] Job ${jobId} tamamlandı`, { returnvalue });
  });

  events.on('failed', ({ jobId, failedReason }) => {
    logger.error(`[Queue:${name}] Job ${jobId} başarısız`, { reason: failedReason });
  });

  events.on('stalled', ({ jobId }) => {
    logger.warn(`[Queue:${name}] Job ${jobId} takıldı (stalled)`);
  });

  events.on('progress', ({ jobId, data }) => {
    logger.debug(`[Queue:${name}] Job ${jobId} ilerleme`, { progress: data });
  });

  events.on('active', ({ jobId }) => {
    logger.debug(`[Queue:${name}] Job ${jobId} işleniyor`);
  });

  queues.set(name, queue);
  queueEvents.set(name, events);
  logger.info(`Queue oluşturuldu: ${name}`);
  
  return queue;
}

/**
 * Worker instance'ı oluşturur
 * Her queue için processor fonksiyonu ile worker başlatır
 */
export function getWorker<T = any, R = any>(
  name: string,
  processor: Processor<T, R>,
  opts?: Partial<WorkerOptions>
): Worker<T, R> {
  if (workers.has(name)) return workers.get(name)! as Worker<T, R>;

  const connection = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  const worker = new Worker<T, R>(
    name,
    async (job: Job<T, R>) => {
      logger.info(`[Worker:${name}] Job ${job.id} başlatıldı`, {
        jobId: job.id,
        attemptsMade: job.attemptsMade,
        data: job.data,
      });

      try {
        const result = await processor(job);
        return result;
      } catch (error: any) {
        logger.error(`[Worker:${name}] Job ${job.id} işlenirken hata`, {
          error: error.message,
          stack: error.stack,
          jobId: job.id,
        });
        throw error;
      }
    },
    {
      connection,
      concurrency: opts?.concurrency || 1,
      autorun: true,
      ...opts,
    }
  );

  worker.on('completed', (job: Job<T, R>) => {
    logger.info(`[Worker:${name}] Job ${job.id} tamamlandı`, {
      jobId: job.id,
      duration: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0,
    });
  });

  worker.on('failed', (job: Job<T, R> | undefined, err: Error) => {
    logger.error(`[Worker:${name}] Job ${job?.id} başarısız`, {
      jobId: job?.id,
      error: err.message,
      stack: err.stack,
      attemptsMade: job?.attemptsMade,
      maxAttempts: job?.opts.attempts,
    });
  });

  worker.on('stalled', (jobId: string) => {
    logger.warn(`[Worker:${name}] Job ${jobId} takıldı (stalled)`);
  });

  worker.on('error', (err: Error) => {
    logger.error(`[Worker:${name}] Worker kritik hatası`, { 
      error: err.message,
      stack: err.stack,
    });
  });

  workers.set(name, worker);
  logger.info(`Worker başlatıldı: ${name}`, {
    concurrency: opts?.concurrency || 1,
  });
  
  return worker;
}

/**
 * Tüm queue ve worker'ları kapat (graceful shutdown için)
 */
export async function closeAllQueues(): Promise<void> {
  logger.info('Tüm queue ve worker\'lar kapatılıyor...');
  const closing: Promise<void>[] = [];
  
  // Önce worker'ları kapat (mevcut işleri bitirsinler)
  for (const [name, worker] of workers) {
    logger.info(`Worker kapatılıyor: ${name}`);
    closing.push(worker.close());
  }
  
  // Sonra queue event'leri kapat
  for (const [name, events] of queueEvents) {
    logger.info(`Queue events kapatılıyor: ${name}`);
    closing.push(events.close());
  }
  
  // Son olarak queue'ları kapat
  for (const [name, queue] of queues) {
    logger.info(`Queue kapatılıyor: ${name}`);
    closing.push(queue.close());
  }
  
  await Promise.all(closing);
  
  workers.clear();
  queueEvents.clear();
  queues.clear();
  
  logger.info('Tüm queue ve worker\'lar başarıyla kapatıldı');
}

/**
 * Queue durumunu döner (monitoring için)
 */
export async function getQueueStatus(name: string): Promise<{
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}> {
  const queue = queues.get(name);
  if (!queue) {
    throw new Error(`Queue bulunamadı: ${name}`);
  }

  const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.isPaused(),
  ]);

  return {
    name,
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused,
  };
}

/**
 * Tüm queue'ların durumunu döner
 */
export async function getAllQueuesStatus() {
  const queueNames = Array.from(queues.keys());
  const statuses = await Promise.all(
    queueNames.map((name) => getQueueStatus(name))
  );
  return statuses;
}
