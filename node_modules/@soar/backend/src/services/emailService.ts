import nodemailer, { Transporter } from 'nodemailer';
import { NotificationJobData } from '../types';
import logger from '../utils/logger';

let transporter: Transporter | null = null;

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

function buildEmailBody(data: NotificationJobData): { subject: string; html: string; text: string } {
  const severityLabel = `${data.eventSeverity}/10`;
  const subject = `[SOAR Alert] Severity ${severityLabel} — ${data.eventTitle}`;

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const eventLink = `${frontendUrl}/analyst`;

  const severityColor = data.eventSeverity >= 8 ? '#dc2626' : data.eventSeverity >= 5 ? '#f59e0b' : '#3b82f6';

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 8px; overflow: hidden; border: 1px solid #334155;">
    <div style="background: ${severityColor}; padding: 16px 24px;">
      <h2 style="color: #fff; margin: 0; font-size: 18px;">SOAR Platform Güvenlik Uyarısı</h2>
      <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0; font-size: 14px;">Severity ${severityLabel}</p>
    </div>
    <div style="padding: 24px;">
      <table style="width: 100%; border-collapse: collapse; color: #e2e8f0; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; width: 140px;">Tetikleyen Kural</td>
          <td style="padding: 8px 0; font-weight: 600;">${data.ruleName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8;">Olay Başlığı</td>
          <td style="padding: 8px 0; font-weight: 600;">${data.eventTitle}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8;">Olay Tipi</td>
          <td style="padding: 8px 0;">${data.eventType}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8;">Entegrasyon</td>
          <td style="padding: 8px 0;">${data.integrationName}</td>
        </tr>
        ${data.sourceIp ? `
        <tr>
          <td style="padding: 8px 0; color: #94a3b8;">Kaynak IP</td>
          <td style="padding: 8px 0; font-family: monospace;">${data.sourceIp}</td>
        </tr>` : ''}
        ${data.destIp ? `
        <tr>
          <td style="padding: 8px 0; color: #94a3b8;">Hedef IP</td>
          <td style="padding: 8px 0; font-family: monospace;">${data.destIp}</td>
        </tr>` : ''}
        <tr>
          <td style="padding: 8px 0; color: #94a3b8;">Zaman</td>
          <td style="padding: 8px 0;">${new Date(data.time).toLocaleString('tr-TR', { timeZone: 'UTC' })} UTC</td>
        </tr>
      </table>
      <div style="margin-top: 24px;">
        <a href="${eventLink}" style="background: ${severityColor}; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 600;">
          SOAR Platform'da Görüntüle
        </a>
      </div>
    </div>
    <div style="padding: 12px 24px; border-top: 1px solid #334155; color: #475569; font-size: 12px;">
      Bu mesaj SOAR Platform tarafından otomatik olarak gönderilmiştir.
    </div>
  </div>
</body>
</html>`.trim();

  const text = [
    `[SOAR Alert] Severity ${severityLabel} — ${data.eventTitle}`,
    '',
    `Kural     : ${data.ruleName}`,
    `Olay      : ${data.eventTitle}`,
    `Tip       : ${data.eventType}`,
    `Entegrasyon: ${data.integrationName}`,
    data.sourceIp ? `Kaynak IP : ${data.sourceIp}` : '',
    data.destIp   ? `Hedef IP  : ${data.destIp}` : '',
    `Zaman     : ${new Date(data.time).toISOString()}`,
    '',
    `Platform  : ${eventLink}`,
  ].filter((line) => line !== '').join('\n');

  return { subject, html, text };
}

export async function sendEmailNotification(to: string, data: NotificationJobData): Promise<void> {
  if (!isEmailConfigured()) {
    logger.warn('[EmailService] SMTP yapılandırılmamış, bildirim atlanıyor', { to });
    return;
  }

  const { subject, html, text } = buildEmailBody(data);
  const from = process.env.SMTP_FROM || 'SOAR Platform <alerts@company.com>';

  await getTransporter().sendMail({ from, to, subject, html, text });
  logger.info('[EmailService] Email gönderildi', { to, subject });
}
