import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { query, queryOne } from '../db/pool';
import { ReportType, ReportTargetRole, Report } from '../types';
import logger from '../utils/logger';

const REPORTS_DIR = path.resolve(process.cwd(), 'reports');

// Dizin yoksa olustur
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

interface ReportParams {
  type: ReportType;
  targetRole: ReportTargetRole;
  periodStart: Date;
  periodEnd: Date;
  generatedBy?: string;
}

// ─── HTML Sablonu ────────────────────────────────────────────────────────────

function baseHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1a1a2e; padding: 40px; }
    .cover { text-align: center; padding: 80px 0 40px; border-bottom: 3px solid #0f3460; margin-bottom: 40px; }
    .cover h1 { font-size: 32px; color: #0f3460; margin-bottom: 8px; }
    .cover h2 { font-size: 20px; color: #16213e; font-weight: 400; }
    .cover .date { margin-top: 16px; color: #666; font-size: 14px; }
    .section { margin-bottom: 32px; page-break-inside: avoid; }
    .section h3 { font-size: 18px; color: #0f3460; border-bottom: 2px solid #e94560; padding-bottom: 6px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
    th { background: #0f3460; color: white; padding: 10px 8px; text-align: left; }
    td { padding: 8px; border-bottom: 1px solid #ddd; }
    tr:nth-child(even) { background: #f8f9fa; }
    .kpi-row { display: flex; gap: 16px; margin-bottom: 24px; }
    .kpi-card { flex: 1; background: #f0f4ff; border-radius: 8px; padding: 20px; text-align: center; border-left: 4px solid #0f3460; }
    .kpi-card .value { font-size: 36px; font-weight: 700; color: #0f3460; }
    .kpi-card .label { font-size: 13px; color: #666; margin-top: 4px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-critical { background: #ffe0e6; color: #c0392b; }
    .badge-high { background: #fff3e0; color: #e67e22; }
    .badge-medium { background: #fff9c4; color: #f39c12; }
    .badge-low { background: #e3f2fd; color: #2980b9; }
    .footer { text-align: center; color: #999; font-size: 11px; margin-top: 40px; border-top: 1px solid #ddd; padding-top: 16px; }
  </style>
</head>
<body>
  ${body}
  <div class="footer">
    Bu rapor SOAR Platform tarafindan otomatik olusturulmustur. &copy; ${new Date().getFullYear()} Kipas Holding
  </div>
</body>
</html>`;
}

function severityBadge(severity: number): string {
  if (severity >= 9) return `<span class="badge badge-critical">Kritik (${severity})</span>`;
  if (severity >= 7) return `<span class="badge badge-high">Yuksek (${severity})</span>`;
  if (severity >= 4) return `<span class="badge badge-medium">Orta (${severity})</span>`;
  return `<span class="badge badge-low">Dusuk (${severity})</span>`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });
}

function periodLabel(type: ReportType): string {
  const map: Record<ReportType, string> = { daily: 'Gunluk', weekly: 'Haftalik', monthly: 'Aylik' };
  return map[type];
}

// ─── Veri Sorgulari ──────────────────────────────────────────────────────────

async function fetchReportData(periodStart: Date, periodEnd: Date) {
  const [
    totalEvents,
    criticalEvents,
    blockedAttacks,
    bySeverity,
    byType,
    byIntegration,
    topSources,
    recentCritical,
    vtSummary,
    resolvedCount,
  ] = await Promise.all([
    queryOne<{ count: string }>(`SELECT COUNT(*)::text as count FROM security_events WHERE time BETWEEN $1 AND $2`, [periodStart, periodEnd]),
    queryOne<{ count: string }>(`SELECT COUNT(*)::text as count FROM security_events WHERE time BETWEEN $1 AND $2 AND severity >= 8`, [periodStart, periodEnd]),
    queryOne<{ count: string }>(`SELECT COUNT(*)::text as count FROM security_events WHERE time BETWEEN $1 AND $2 AND event_type = 'firewall_block'`, [periodStart, periodEnd]),
    query(`SELECT severity, COUNT(*)::int as count FROM security_events WHERE time BETWEEN $1 AND $2 GROUP BY severity ORDER BY severity DESC`, [periodStart, periodEnd]),
    query(`SELECT event_type, COUNT(*)::int as count FROM security_events WHERE time BETWEEN $1 AND $2 GROUP BY event_type ORDER BY count DESC LIMIT 10`, [periodStart, periodEnd]),
    query(`SELECT integration_name, COUNT(*)::int as count FROM security_events WHERE time BETWEEN $1 AND $2 GROUP BY integration_name ORDER BY count DESC`, [periodStart, periodEnd]),
    query(`SELECT source_ip::text as ip, COUNT(*)::int as count FROM security_events WHERE time BETWEEN $1 AND $2 AND source_ip IS NOT NULL GROUP BY source_ip ORDER BY count DESC LIMIT 10`, [periodStart, periodEnd]),
    query(`SELECT time, title, severity, integration_name, source_ip FROM security_events WHERE time BETWEEN $1 AND $2 AND severity >= 7 ORDER BY severity DESC, time DESC LIMIT 5`, [periodStart, periodEnd]),
    queryOne<{ total: string; malicious: string }>(`SELECT COUNT(*)::text as total, COUNT(*) FILTER (WHERE verdict = 'malicious')::text as malicious FROM vt_scans WHERE scanned_at BETWEEN $1 AND $2`, [periodStart, periodEnd]),
    queryOne<{ count: string }>(`SELECT COUNT(*)::text as count FROM security_events WHERE time BETWEEN $1 AND $2 AND is_resolved = true`, [periodStart, periodEnd]),
  ]);

  return {
    totalEvents: parseInt(totalEvents?.count ?? '0', 10),
    criticalEvents: parseInt(criticalEvents?.count ?? '0', 10),
    blockedAttacks: parseInt(blockedAttacks?.count ?? '0', 10),
    bySeverity: bySeverity as Array<{ severity: number; count: number }>,
    byType: byType as Array<{ event_type: string; count: number }>,
    byIntegration: byIntegration as Array<{ integration_name: string; count: number }>,
    topSources: topSources as Array<{ ip: string; count: number }>,
    recentCritical: recentCritical as Array<Record<string, unknown>>,
    vtTotal: parseInt(vtSummary?.total ?? '0', 10),
    vtMalicious: parseInt(vtSummary?.malicious ?? '0', 10),
    resolvedCount: parseInt(resolvedCount?.count ?? '0', 10),
  };
}

// ─── C-Level Raporu ──────────────────────────────────────────────────────────

function buildCLevelHtml(data: Awaited<ReturnType<typeof fetchReportData>>, params: ReportParams): string {
  const criticalRows = data.recentCritical.map((e) =>
    `<tr><td>${new Date(String(e.time)).toLocaleString('tr-TR')}</td><td>${e.integration_name}</td><td>${e.title}</td><td>${severityBadge(Number(e.severity))}</td></tr>`
  ).join('');

  const integrationRows = data.byIntegration.map((r) =>
    `<tr><td>${r.integration_name}</td><td>${r.count}</td></tr>`
  ).join('');

  const body = `
    <div class="cover">
      <h1>SOAR Platform — Guvenlik Raporu</h1>
      <h2>${periodLabel(params.type)} Yonetici Ozeti</h2>
      <div class="date">${formatDate(params.periodStart)} — ${formatDate(params.periodEnd)}</div>
    </div>

    <div class="section">
      <h3>Yonetici Ozeti</h3>
      <div class="kpi-row">
        <div class="kpi-card"><div class="value">${data.totalEvents}</div><div class="label">Toplam Tehdit</div></div>
        <div class="kpi-card"><div class="value">${data.blockedAttacks}</div><div class="label">Engellenen Saldiri</div></div>
        <div class="kpi-card"><div class="value">${data.criticalEvents}</div><div class="label">Kritik Olay</div></div>
        <div class="kpi-card"><div class="value">${data.resolvedCount}</div><div class="label">Cozulen Olay</div></div>
      </div>
    </div>

    <div class="section">
      <h3>Son Kritik Olaylar</h3>
      <table><thead><tr><th>Zaman</th><th>Kaynak</th><th>Olay</th><th>Seviye</th></tr></thead>
      <tbody>${criticalRows || '<tr><td colspan="4">Kritik olay bulunmamaktadir</td></tr>'}</tbody></table>
    </div>

    <div class="section">
      <h3>Entegrasyon Bazli Ozet</h3>
      <table><thead><tr><th>Entegrasyon</th><th>Olay Sayisi</th></tr></thead>
      <tbody>${integrationRows || '<tr><td colspan="2">Veri yok</td></tr>'}</tbody></table>
    </div>`;

  return baseHtml(`${periodLabel(params.type)} Rapor — C-Level`, body);
}

// ─── Analist Raporu ──────────────────────────────────────────────────────────

function buildAnalystHtml(data: Awaited<ReturnType<typeof fetchReportData>>, params: ReportParams): string {
  const severityRows = data.bySeverity.map((r) =>
    `<tr><td>${severityBadge(r.severity)}</td><td>${r.count}</td></tr>`
  ).join('');

  const typeRows = data.byType.map((r) =>
    `<tr><td>${r.event_type}</td><td>${r.count}</td></tr>`
  ).join('');

  const integrationRows = data.byIntegration.map((r) =>
    `<tr><td>${r.integration_name}</td><td>${r.count}</td></tr>`
  ).join('');

  const sourceRows = data.topSources.map((r) =>
    `<tr><td>${r.ip}</td><td>${r.count}</td></tr>`
  ).join('');

  const body = `
    <div class="cover">
      <h1>SOAR Platform — Detayli Guvenlik Raporu</h1>
      <h2>${periodLabel(params.type)} Analist Raporu</h2>
      <div class="date">${formatDate(params.periodStart)} — ${formatDate(params.periodEnd)}</div>
    </div>

    <div class="section">
      <h3>Genel Ozet</h3>
      <div class="kpi-row">
        <div class="kpi-card"><div class="value">${data.totalEvents}</div><div class="label">Toplam Olay</div></div>
        <div class="kpi-card"><div class="value">${data.criticalEvents}</div><div class="label">Kritik</div></div>
        <div class="kpi-card"><div class="value">${data.resolvedCount}</div><div class="label">Cozulen</div></div>
        <div class="kpi-card"><div class="value">${data.vtTotal} / ${data.vtMalicious}</div><div class="label">VT Tarama / Zararli</div></div>
      </div>
    </div>

    <div class="section">
      <h3>Entegrasyon Bazli Dagilim</h3>
      <table><thead><tr><th>Entegrasyon</th><th>Olay Sayisi</th></tr></thead>
      <tbody>${integrationRows}</tbody></table>
    </div>

    <div class="section">
      <h3>Severity Dagilimi</h3>
      <table><thead><tr><th>Seviye</th><th>Sayi</th></tr></thead>
      <tbody>${severityRows}</tbody></table>
    </div>

    <div class="section">
      <h3>En Cok Tetiklenen Olay Tipleri</h3>
      <table><thead><tr><th>Olay Tipi</th><th>Sayi</th></tr></thead>
      <tbody>${typeRows}</tbody></table>
    </div>

    <div class="section">
      <h3>Top 10 Kaynak IP</h3>
      <table><thead><tr><th>IP Adresi</th><th>Olay Sayisi</th></tr></thead>
      <tbody>${sourceRows || '<tr><td colspan="2">Veri yok</td></tr>'}</tbody></table>
    </div>`;

  return baseHtml(`${periodLabel(params.type)} Rapor — Analist`, body);
}

// ─── PDF Olusturma ───────────────────────────────────────────────────────────

export async function generateReport(params: ReportParams): Promise<string> {
  const { type, targetRole, periodStart, periodEnd, generatedBy } = params;

  logger.info(`[ReportGenerator] ${type} raporu olusturuluyor (hedef: ${targetRole})`);

  const data = await fetchReportData(periodStart, periodEnd);

  const dateStr = periodStart.toISOString().slice(0, 10);
  const filename = `${type}_${dateStr}_${targetRole}.pdf`;
  const outputPath = path.join(REPORTS_DIR, filename);

  let htmlContent: string;
  if (targetRole === 'c_level') {
    htmlContent = buildCLevelHtml(data, params);
  } else if (targetRole === 'analyst') {
    htmlContent = buildAnalystHtml(data, params);
  } else {
    // 'all' — her ikisini birleştir
    htmlContent = buildCLevelHtml(data, params) + '<div style="page-break-before:always"></div>' + buildAnalystHtml(data, params);
  }

  // Puppeteer ile PDF
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
    });
  } finally {
    await browser.close();
  }

  // DB kaydi
  const [report] = await query<Report>(
    `INSERT INTO reports (type, target_role, period_start, period_end, pdf_path, generated_by, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      type, targetRole, periodStart, periodEnd, outputPath,
      generatedBy ?? null,
      JSON.stringify({
        total_events: data.totalEvents,
        critical_events: data.criticalEvents,
        blocked_attacks: data.blockedAttacks,
      }),
    ],
  );

  logger.info(`[ReportGenerator] Rapor olusturuldu: ${outputPath} (id: ${report.id})`);

  return outputPath;
}
