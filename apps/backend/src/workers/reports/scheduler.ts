import cron from 'node-cron';
import { Job } from 'bullmq';
import { getQueue, getWorker } from '../queue';
import { generateReport } from '../../services/reportGenerator';
import logger from '../../utils/logger';

interface ReportJobData {
  type: 'daily' | 'weekly' | 'monthly';
  targetRole: 'c_level' | 'analyst' | 'all';
  periodStart: string;
  periodEnd: string;
  generatedBy?: string;
}

// ─── Report Worker Processor ────────────────────────────────────────────────

async function processReportJob(job: Job<ReportJobData>): Promise<void> {
  const { type, targetRole, periodStart, periodEnd, generatedBy } = job.data;

  logger.info(`[ReportWorker] Rapor olusturuluyor: ${type} / ${targetRole}`);

  await generateReport({
    type,
    targetRole,
    periodStart: new Date(periodStart),
    periodEnd: new Date(periodEnd),
    generatedBy,
  });

  logger.info(`[ReportWorker] Rapor tamamlandi: ${type} / ${targetRole}`);
}

// ─── Cron ile Otomatik Rapor Tetikleme ──────────────────────────────────────

function scheduleReport(
  cronExpression: string,
  type: 'daily' | 'weekly' | 'monthly',
  label: string,
): void {
  cron.schedule(cronExpression, async () => {
    logger.info(`[ReportScheduler] ${label} rapor tetiklendi`);

    const now = new Date();
    let periodStart: Date;

    if (type === 'daily') {
      periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (type === 'weekly') {
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const reportQueue = getQueue('report_generator');

    // C-Level ve Analyst icin ayri raporlar
    const roles: Array<'c_level' | 'analyst'> = ['c_level', 'analyst'];

    for (const targetRole of roles) {
      await reportQueue.add(`${type}_${targetRole}`, {
        type,
        targetRole,
        periodStart: periodStart.toISOString(),
        periodEnd: now.toISOString(),
      });

      logger.info(`[ReportScheduler] ${label} rapor kuyruğa eklendi: ${targetRole}`);
    }
  }, {
    timezone: 'Europe/Istanbul',
  });

  logger.info(`[ReportScheduler] ${label} cron kaydedildi: ${cronExpression}`);
}

// ─── Disa Acik Fonksiyon ────────────────────────────────────────────────────

export function startReportScheduler(): void {
  // Worker'i baslat
  getWorker('report_generator', processReportJob);

  // Gunluk rapor: Her gun 07:00 (Turkiye saati)
  // UTC 04:00 = TR 07:00
  scheduleReport('0 4 * * *', 'daily', 'Gunluk');

  // Haftalik rapor: Her Pazartesi 07:00
  scheduleReport('0 4 * * 1', 'weekly', 'Haftalik');

  // Aylik rapor: Her ayin 1'inde 07:00
  scheduleReport('0 4 1 * *', 'monthly', 'Aylik');

  logger.info('[ReportScheduler] Tum cron job\'lar baslatildi');
}
