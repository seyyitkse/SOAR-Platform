-- ============================================================
-- SOAR Platform - Tam Veritabanı Şeması
-- TimescaleDB extension zorunlu
-- ============================================================

-- Extension'ları aktifleştir
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 001: ROLLER ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);

-- ─── 002: KULLANICILAR ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      VARCHAR(50) UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_id       UUID NOT NULL REFERENCES roles(id),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- ─── 003: ENTEGRASYONLAR ────────────────────────────────────

CREATE TABLE IF NOT EXISTS integrations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(100) UNIQUE NOT NULL,
  display_name      VARCHAR(150) NOT NULL,
  base_url          VARCHAR(500) NOT NULL DEFAULT '',
  poll_interval_sec INTEGER NOT NULL DEFAULT 300,
  status            VARCHAR(20) NOT NULL DEFAULT 'disabled'
                      CHECK (status IN ('active','error','disabled','syncing')),
  last_sync_at      TIMESTAMPTZ,
  error_message     TEXT,
  config            JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integrations_name ON integrations(name);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations(status);

-- ─── 004: API ANAHTARLARI ───────────────────────────────────

CREATE TABLE IF NOT EXISTS api_keys (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  key_name       VARCHAR(100) NOT NULL,
  key_hash       TEXT NOT NULL,   -- AES-256 şifreli
  expires_at     TIMESTAMPTZ,
  last_used_at   TIMESTAMPTZ,
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(integration_id, key_name)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_integration ON api_keys(integration_id);

-- ─── 005: GÜVENLİK OLAYLARI (TimescaleDB hypertable) ────────

CREATE TABLE IF NOT EXISTS security_events (
  id               UUID NOT NULL DEFAULT uuid_generate_v4(),
  time             TIMESTAMPTZ NOT NULL,
  integration_id   UUID REFERENCES integrations(id),
  integration_name VARCHAR(100) NOT NULL,
  source_ip        INET,
  dest_ip          INET,
  source_host      VARCHAR(255),
  dest_host        VARCHAR(255),
  severity         SMALLINT NOT NULL CHECK (severity BETWEEN 1 AND 10),
  event_type       VARCHAR(100) NOT NULL,
  title            VARCHAR(500) NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  raw_payload      JSONB NOT NULL DEFAULT '{}',
  is_resolved      BOOLEAN NOT NULL DEFAULT false,
  resolved_by      UUID REFERENCES users(id),
  resolved_at      TIMESTAMPTZ,
  notes            TEXT,
  PRIMARY KEY (time, id)
);

-- TimescaleDB hypertable'a dönüştür (chunk: 1 gün)
SELECT create_hypertable(
  'security_events', 'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Otomatik compression (7 günden eski chunk'lar)
SELECT add_compression_policy('security_events', INTERVAL '7 days', if_not_exists => TRUE);

-- Retention (90 gün sonra sil)
SELECT add_retention_policy('security_events', INTERVAL '90 days', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_se_integration ON security_events(integration_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_se_severity ON security_events(severity, time DESC);
CREATE INDEX IF NOT EXISTS idx_se_event_type ON security_events(event_type, time DESC);
CREATE INDEX IF NOT EXISTS idx_se_source_ip ON security_events(source_ip, time DESC);
CREATE INDEX IF NOT EXISTS idx_se_unresolved ON security_events(is_resolved, time DESC) WHERE is_resolved = false;

-- ─── 006: SİSTEM METRİKLERİ (TimescaleDB hypertable) ────────

CREATE TABLE IF NOT EXISTS system_metrics (
  time        TIMESTAMPTZ NOT NULL,
  host_id     VARCHAR(100) NOT NULL,
  host_name   VARCHAR(255) NOT NULL,
  metric_name VARCHAR(100) NOT NULL,
  value       DOUBLE PRECISION NOT NULL,
  unit        VARCHAR(50) NOT NULL DEFAULT '',
  tags        JSONB NOT NULL DEFAULT '{}'
);

SELECT create_hypertable(
  'system_metrics', 'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

SELECT add_compression_policy('system_metrics', INTERVAL '3 days', if_not_exists => TRUE);
SELECT add_retention_policy('system_metrics', INTERVAL '30 days', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_sm_host ON system_metrics(host_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_sm_metric ON system_metrics(metric_name, time DESC);

-- ─── 007: VİRUSTOTAL TARAMALAR ──────────────────────────────

CREATE TABLE IF NOT EXISTS vt_scans (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hash              VARCHAR(128) UNIQUE NOT NULL,
  hash_type         VARCHAR(10) NOT NULL CHECK (hash_type IN ('sha256','md5','sha1')),
  malicious_count   INTEGER NOT NULL DEFAULT 0,
  suspicious_count  INTEGER NOT NULL DEFAULT 0,
  harmless_count    INTEGER NOT NULL DEFAULT 0,
  undetected_count  INTEGER NOT NULL DEFAULT 0,
  total_engines     INTEGER NOT NULL DEFAULT 0,
  verdict           VARCHAR(20) NOT NULL DEFAULT 'unknown'
                      CHECK (verdict IN ('clean','suspicious','malicious','unknown')),
  file_name         VARCHAR(500),
  file_type         VARCHAR(100),
  file_size         BIGINT,
  raw_response      JSONB NOT NULL DEFAULT '{}',
  scanned_by        UUID NOT NULL REFERENCES users(id),
  scanned_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vt_hash ON vt_scans(hash);
CREATE INDEX IF NOT EXISTS idx_vt_verdict ON vt_scans(verdict);
CREATE INDEX IF NOT EXISTS idx_vt_scanned_at ON vt_scans(scanned_at DESC);

-- ─── 008: RAPORLAR ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reports (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type         VARCHAR(20) NOT NULL CHECK (type IN ('daily','weekly','monthly')),
  target_role  VARCHAR(20) NOT NULL DEFAULT 'all'
                 CHECK (target_role IN ('c_level','analyst','all')),
  period_start TIMESTAMPTZ NOT NULL,
  period_end   TIMESTAMPTZ NOT NULL,
  pdf_path     VARCHAR(500),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by UUID REFERENCES users(id),
  metadata     JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_period ON reports(period_start, period_end);

-- ─── 009: ALERT KURALLARI ───────────────────────────────────

CREATE TABLE IF NOT EXISTS alert_rules (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                VARCHAR(200) NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  integration_name    VARCHAR(100),
  event_type          VARCHAR(100),
  severity_threshold  SMALLINT NOT NULL DEFAULT 7 CHECK (severity_threshold BETWEEN 1 AND 10),
  condition           JSONB NOT NULL DEFAULT '{}',
  action              VARCHAR(30) NOT NULL DEFAULT 'notify_and_log'
                        CHECK (action IN ('notify','log','notify_and_log')),
  notify_channels     JSONB NOT NULL DEFAULT '[]',
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_active ON alert_rules(is_active);

-- ─── 010: DENETİM KAYITLARI ─────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id),
  username    VARCHAR(50) NOT NULL,
  action      VARCHAR(100) NOT NULL,
  resource    VARCHAR(100) NOT NULL,
  resource_id UUID,
  ip_address  INET NOT NULL,
  user_agent  TEXT NOT NULL DEFAULT '',
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- ─── 011: REFRESH TOKEN ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- ─── SEED: VARSAYILAN ROLLER ────────────────────────────────

INSERT INTO roles (name, display_name, permissions) VALUES
  (
    'super_admin',
    'Süper Yönetici',
    '{
      "view_executive_dashboard": true,
      "view_analyst_dashboard": true,
      "view_security_events": true,
      "view_system_metrics": true,
      "manage_integrations": true,
      "manage_users": true,
      "manage_api_keys": true,
      "trigger_virustotal": true,
      "view_reports": true,
      "generate_reports": true,
      "manage_alert_rules": true,
      "view_audit_logs": true
    }'
  ),
  (
    'admin',
    'Sistem Yöneticisi / IT Müdürü',
    '{
      "view_executive_dashboard": true,
      "view_analyst_dashboard": true,
      "view_security_events": true,
      "view_system_metrics": true,
      "manage_integrations": true,
      "manage_users": false,
      "manage_api_keys": true,
      "trigger_virustotal": true,
      "view_reports": true,
      "generate_reports": true,
      "manage_alert_rules": true,
      "view_audit_logs": true
    }'
  ),
  (
    'analyst',
    'Güvenlik Analisti',
    '{
      "view_executive_dashboard": false,
      "view_analyst_dashboard": true,
      "view_security_events": true,
      "view_system_metrics": true,
      "manage_integrations": false,
      "manage_users": false,
      "manage_api_keys": false,
      "trigger_virustotal": true,
      "view_reports": true,
      "generate_reports": false,
      "manage_alert_rules": false,
      "view_audit_logs": false
    }'
  ),
  (
    'c_level',
    'Üst Yönetim',
    '{
      "view_executive_dashboard": true,
      "view_analyst_dashboard": false,
      "view_security_events": false,
      "view_system_metrics": false,
      "manage_integrations": false,
      "manage_users": false,
      "manage_api_keys": false,
      "trigger_virustotal": false,
      "view_reports": true,
      "generate_reports": false,
      "manage_alert_rules": false,
      "view_audit_logs": false
    }'
  )
ON CONFLICT (name) DO NOTHING;

-- ─── SEED: VARSAYILAN ENTEGRASYONLAR ────────────────────────

INSERT INTO integrations (name, display_name, poll_interval_sec, status) VALUES
  ('cortex_xdr',           'Cortex XDR',           300, 'disabled'),
  ('palo_alto_panorama',   'Palo Alto Panorama',    300, 'disabled'),
  ('fortimail',            'FortiMail',             120, 'disabled'),
  ('zabbix',               'Zabbix',                 60, 'disabled'),
  ('virustotal',           'VirusTotal',              0, 'disabled')
ON CONFLICT (name) DO NOTHING;

-- ─── CONTINUOUS AGGREGATES ──────────────────────────────────

-- Saatlik güvenlik olayları özeti
CREATE MATERIALIZED VIEW IF NOT EXISTS security_events_hourly
WITH (timescaledb.continuous) AS
  SELECT
    time_bucket('1 hour', time) AS bucket,
    integration_name,
    severity,
    event_type,
    COUNT(*) AS event_count,
    COUNT(*) FILTER (WHERE is_resolved = true) AS resolved_count
  FROM security_events
  GROUP BY bucket, integration_name, severity, event_type
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
  'security_events_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- Saatlik sistem metrikleri özeti
CREATE MATERIALIZED VIEW IF NOT EXISTS system_metrics_hourly
WITH (timescaledb.continuous) AS
  SELECT
    time_bucket('1 hour', time) AS bucket,
    host_id,
    host_name,
    metric_name,
    AVG(value) AS avg_value,
    MAX(value) AS max_value,
    MIN(value) AS min_value
  FROM system_metrics
  GROUP BY bucket, host_id, host_name, metric_name
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
  'system_metrics_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);
