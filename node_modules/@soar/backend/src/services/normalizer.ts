import { NormalizedEvent, EventType, EventSeverity, IntegrationName } from '../types';

// ─── Severity Mapping ────────────────────────────────────────────────────────

function clampSeverity(val: number): EventSeverity {
  const clamped = Math.max(1, Math.min(10, Math.round(val)));
  return clamped as EventSeverity;
}

const CORTEX_SEVERITY_MAP: Record<number, number> = {
  1: 2,
  2: 4,
  3: 6,
  4: 8,
  5: 10,
};

const ZABBIX_PRIORITY_MAP: Record<number, number> = {
  0: 1,
  1: 2,
  2: 4,
  3: 6,
  4: 8,
  5: 10,
};

// ─── EventType Detection ─────────────────────────────────────────────────────

const EVENT_TYPE_KEYWORDS: Array<{ keywords: string[]; type: EventType }> = [
  { keywords: ['malware', 'virus', 'trojan', 'worm', 'ransomware'], type: 'malware_detected' },
  { keywords: ['firewall', 'block', 'deny', 'drop', 'reject'], type: 'firewall_block' },
  { keywords: ['login', 'auth', 'password', 'credential', 'brute'], type: 'authentication_failure' },
  { keywords: ['spam', 'phish', 'email', 'mail threat'], type: 'email_threat' },
  { keywords: ['intrusion', 'exploit', 'attack', 'injection', 'overflow'], type: 'intrusion_attempt' },
  { keywords: ['suspicious', 'anomal', 'unusual'], type: 'suspicious_process' },
  { keywords: ['lateral', 'movement', 'pivot'], type: 'lateral_movement' },
  { keywords: ['exfil', 'leak', 'data loss'], type: 'data_exfiltration' },
  { keywords: ['policy', 'violation', 'compliance'], type: 'policy_violation' },
  { keywords: ['vulnerability', 'cve', 'patch'], type: 'vulnerability_exploit' },
];

function detectEventType(text: string): EventType {
  const lower = text.toLowerCase();
  for (const { keywords, type } of EVENT_TYPE_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return type;
    }
  }
  return 'unknown';
}

// ─── Cortex XDR ──────────────────────────────────────────────────────────────

export function normalizeCortexXDR(
  rawEvent: Record<string, unknown>,
  integrationId: string
): NormalizedEvent {
  const rawSeverity = Number(rawEvent.severity) || 3;
  const severity = clampSeverity(CORTEX_SEVERITY_MAP[rawSeverity] ?? rawSeverity * 2);

  const name = String(rawEvent.name ?? rawEvent.alert_name ?? 'Cortex XDR Alert');
  const category = String(rawEvent.category ?? '');

  return {
    time: rawEvent.detection_timestamp
      ? new Date(Number(rawEvent.detection_timestamp))
      : new Date(),
    integration_id: integrationId,
    integration_name: 'cortex_xdr',
    source_ip: (rawEvent.local_ip as string) ?? undefined,
    dest_ip: (rawEvent.remote_ip as string) ?? undefined,
    source_host: (rawEvent.host_name as string) ?? undefined,
    severity,
    event_type: detectEventType(`${name} ${category}`),
    title: name,
    description: `[Cortex XDR] ${name} — Category: ${category}, Host: ${rawEvent.host_name ?? 'N/A'}, Process: ${rawEvent.actor_process_image_path ?? 'N/A'}`,
    raw_payload: rawEvent,
  };
}

// ─── Palo Alto Panorama ──────────────────────────────────────────────────────

const PANORAMA_SEVERITY_MAP: Record<string, number> = {
  informational: 2,
  low: 3,
  medium: 5,
  high: 7,
  critical: 10,
};

export function normalizePanorama(
  rawEvent: Record<string, unknown>,
  integrationId: string
): NormalizedEvent {
  const severityStr = String(rawEvent.severity ?? 'medium').toLowerCase();
  const severity = clampSeverity(
    PANORAMA_SEVERITY_MAP[severityStr] ?? 5
  );

  const type = String(rawEvent.type ?? '');
  const subtype = String(rawEvent.subtype ?? '');
  const action = String(rawEvent.action ?? '');
  const application = String(rawEvent.application ?? '');
  const title = `[Panorama] ${type}/${subtype}: ${action}`;

  return {
    time: rawEvent.time_generated
      ? new Date(String(rawEvent.time_generated))
      : new Date(),
    integration_id: integrationId,
    integration_name: 'palo_alto_panorama',
    source_ip: (rawEvent.src as string) ?? undefined,
    dest_ip: (rawEvent.dst as string) ?? undefined,
    source_host: (rawEvent.srcuser as string) ?? undefined,
    dest_host: (rawEvent.dstuser as string) ?? undefined,
    severity,
    event_type: detectEventType(`${type} ${subtype} ${action} ${application}`),
    title,
    description: `${title} — App: ${application}, Src: ${rawEvent.src ?? 'N/A'} → Dst: ${rawEvent.dst ?? 'N/A'}`,
    raw_payload: rawEvent,
  };
}

// ─── FortiMail ───────────────────────────────────────────────────────────────

function fortiMailSeverity(rawEvent: Record<string, unknown>): EventSeverity {
  const disposition = String(rawEvent.disposition ?? '').toLowerCase();
  const virusName = String(rawEvent.virus_name ?? '');
  const action = String(rawEvent.action ?? '').toLowerCase();

  if (virusName && virusName !== 'N/A' && virusName !== '') return 9;
  if (disposition === 'reject' || action === 'reject') return 7;
  if (disposition === 'quarantine' || action === 'quarantine') return 6;
  if (disposition === 'discard' || action === 'discard') return 5;
  return 3;
}

export function normalizeFortiMail(
  rawEvent: Record<string, unknown>,
  integrationId: string
): NormalizedEvent {
  const date = String(rawEvent.date ?? '');
  const time = String(rawEvent.time ?? '');
  const eventTime = date && time ? new Date(`${date}T${time}`) : new Date();

  const subject = String(rawEvent.subject ?? 'N/A');
  const from = String(rawEvent.from ?? 'N/A');
  const to = String(rawEvent.to ?? 'N/A');
  const virusName = String(rawEvent.virus_name ?? '');
  const disposition = String(rawEvent.disposition ?? rawEvent.action ?? '');

  const title = virusName
    ? `[FortiMail] Virus tespit edildi: ${virusName}`
    : `[FortiMail] E-posta tehdidi: ${disposition}`;

  return {
    time: eventTime,
    integration_id: integrationId,
    integration_name: 'fortimail',
    source_ip: (rawEvent.client_ip as string) ?? undefined,
    source_host: from,
    dest_host: to,
    severity: fortiMailSeverity(rawEvent),
    event_type: detectEventType(`${virusName} ${disposition} email ${subject}`),
    title,
    description: `${title} — From: ${from}, To: ${to}, Subject: ${subject}, Disposition: ${disposition}`,
    raw_payload: rawEvent,
  };
}

// ─── Zabbix ──────────────────────────────────────────────────────────────────

export function normalizeZabbix(
  rawTrigger: Record<string, unknown>,
  integrationId: string
): NormalizedEvent {
  const priority = Number(rawTrigger.priority ?? rawTrigger.severity ?? 2);
  const severity = clampSeverity(ZABBIX_PRIORITY_MAP[priority] ?? priority * 2);

  const description = String(rawTrigger.description ?? rawTrigger.name ?? 'Zabbix Problem');
  const hostname = String(
    rawTrigger.hostname ??
    (Array.isArray(rawTrigger.hosts) ? (rawTrigger.hosts[0] as Record<string, unknown>)?.host : '') ??
    'N/A'
  );
  const hostName = String(
    rawTrigger.hostname ??
    (Array.isArray(rawTrigger.hosts) ? (rawTrigger.hosts[0] as Record<string, unknown>)?.name : '') ??
    hostname
  );
  const ip = String(rawTrigger.ip ?? '');

  const lastchange = rawTrigger.lastchange
    ? new Date(Number(rawTrigger.lastchange) * 1000)
    : new Date();

  return {
    time: lastchange,
    integration_id: integrationId,
    integration_name: 'zabbix',
    source_ip: ip || undefined,
    source_host: hostName,
    severity,
    event_type: detectEventType(description),
    title: `[Zabbix] ${description}`,
    description: `[Zabbix] ${description} — Host: ${hostName} (${ip || 'N/A'})`,
    raw_payload: rawTrigger,
  };
}
