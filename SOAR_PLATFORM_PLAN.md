# SOAR Platform — Tam Geliştirme Planı
## Claude Code (VS Code) Agent için Detaylı Görev Kılavuzu

---

## 🎯 PROJE TANIMI

Kipaş Holding ölçeğinde kurumsal bir **Merkezi Güvenlik İzleme ve Otomasyon (SOAR)** platformu.  
n8n mantığıyla çalışan, kendi kendine yeten, rol bazlı (RBAC) bir web uygulaması.

**Entegre Edilecek Sistemler:**
- Cortex XDR (Endpoint/ağ güvenlik logları)
- Palo Alto Panorama (Firewall kuralları/metrikleri)
- FortiMail (E-posta güvenlik logları)
- Zabbix (Sistem/sunucu/ağ izleme — tamamen API tabanlı özel yazılacak)
- VirusTotal API (SHA256/MD5 hash tarama)

---

## 📁 MEVCUT DOSYALAR (Zaten Yazıldı — Dokunma)

```
soar-platform/
├── package.json                          ✅ Monorepo root
├── docker/
│   ├── docker-compose.yml                ✅ TimescaleDB + Redis + Backend + Frontend
│   └── .env.example                      ✅
└── apps/
    └── backend/
        ├── package.json                  ✅
        ├── tsconfig.json                 ✅
        ├── .env.example                  ✅
        └── src/
            ├── types/index.ts            ✅ Tüm TypeScript tipleri
            ├── db/
            │   ├── pool.ts               ✅ PostgreSQL bağlantı havuzu
            │   ├── redis.ts              ✅ Redis + cache yardımcıları
            │   ├── migrate.ts            ✅ Migration runner
            │   ├── seed.ts               ✅ Default kullanıcılar
            │   └── migrations/
            │       └── 001_initial.sql   ✅ TAM şema (TimescaleDB hypertable'lar dahil)
            ├── middleware/
            │   └── auth.ts               ✅ JWT + RBAC middleware
            ├── utils/
            │   ├── crypto.ts             ✅ AES-256 şifreleme
            │   └── logger.ts             ✅ Winston logger
            └── routes/
                ├── auth.ts               ✅ Login/refresh/logout/me
                ├── users.ts              ✅ Kullanıcı CRUD
                ├── integrations.ts       ✅ Entegrasyon yönetimi + API key
                └── events.ts             ✅ Güvenlik olayları + istatistikler
```

---

## 🏗️ TEKNOLOJİ YIĞINI

### Backend
- **Runtime:** Node.js 20 LTS
- **Framework:** Fastify 4 + TypeScript
- **Auth:** @fastify/jwt (JWT) + bcryptjs
- **Queue:** BullMQ (Redis tabanlı)
- **Şifreleme:** crypto-js (AES-256)
- **HTTP Client:** axios
- **PDF:** Puppeteer
- **Doğrulama:** Zod
- **Logger:** Winston

### Frontend
- **Framework:** Next.js 14 (App Router) + TypeScript
- **UI:** Tailwind CSS + shadcn/ui
- **Charts:** Recharts
- **State:** Zustand + TanStack Query (React Query)
- **HTTP:** axios
- **WebSocket:** socket.io-client
- **Form:** react-hook-form + zod

### Veritabanı
- **Ana DB:** PostgreSQL 16 + TimescaleDB (tek container)
- **Cache/Queue:** Redis 7

---

## 📋 YAZILACAK DOSYALAR — SIRALI GÖREV LİSTESİ

Her görevi sırayla tamamla. Bir görevi bitirmeden diğerine geçme.

---

### ═══════════════════════════════════
### FAZ 1 — BACKEND TAMAMLAMA
### ═══════════════════════════════════

---

#### GÖREV 1: BullMQ Queue Yöneticisi
**Dosya:** `apps/backend/src/workers/queue.ts`

```typescript
// Bu dosya şunları yapmalı:
// - getQueue(name: string): Queue — singleton queue instance döner
// - getWorker(name, processor): Worker — worker instance oluşturur
// - Tüm queue'lar için ortak retry/backoff ayarları
// - Queue event'lerini (failed, completed, stalled) loglar

// Kullanılacak queue isimleri:
// 'cortex_xdr_collector'
// 'panorama_collector'
// 'fortimail_collector'
// 'zabbix_collector'
// 'virustotal_scanner'
// 'report_generator'

// Retry ayarları: attempts: 3, backoff: { type: 'exponential', delay: 5000 }
```

---

#### GÖREV 2: Normalizer Servisi
**Dosya:** `apps/backend/src/services/normalizer.ts`

```typescript
// Her entegrasyondan gelen ham veriyi NormalizedEvent formatına dönüştürür
// NormalizedEvent tipi types/index.ts'de zaten tanımlı

// Fonksiyonlar:
// normalizeCortexXDR(rawEvent: Record<string,unknown>, integrationId: string): NormalizedEvent
// normalizePanorama(rawEvent: Record<string,unknown>, integrationId: string): NormalizedEvent
// normalizeFortiMail(rawEvent: Record<string,unknown>, integrationId: string): NormalizedEvent
// normalizeZabbix(rawTrigger: Record<string,unknown>, integrationId: string): NormalizedEvent

// Cortex XDR alanları: alert_id, name, severity(1-5 → 1-10'a scale et), category,
//   host_name, actor_process_image_path, local_ip, remote_ip, detection_timestamp

// Panorama alanları: seqno, type, subtype, severity, src, dst, 
//   srcuser, dstuser, application, action, time_generated

// FortiMail alanları: id, date, time, client_ip, from, to, 
//   virus_name, action, disposition, subject

// Zabbix alanları: triggerid, description, priority(0-5 → 1-10'a map et),
//   hostname, ip, lastchange, status, value

// Severity mapping örnekleri:
// Cortex: 1→2, 2→4, 3→6, 4→8, 5→10
// Zabbix priority: 0→1, 1→2, 2→4, 3→6, 4→8, 5→10

// EventType mapping için keyword matching kullan:
// 'malware','virus','trojan' → 'malware_detected'
// 'firewall','block','deny' → 'firewall_block'
// 'login','auth','password' → 'authentication_failure'
// 'spam','phish','email' → 'email_threat'
// vs.
```

---

#### GÖREV 3: Cortex XDR Collector Worker
**Dosya:** `apps/backend/src/workers/collectors/cortexXDR.ts`

```typescript
// BullMQ Worker — Cortex XDR REST API'den veri çeker

// Cortex XDR API dökümantasyonu:
// POST https://{base_url}/public_api/v1/alerts/get_alerts_multi_events
// Auth: x-xdr-auth-id ve x-xdr-nonce header'ları + HMAC-SHA256 imzası
// Body: { "request_data": { "filters": [...], "search_from": 0, "search_to": 100 } }

// İşlem sırası:
// 1. integrations tablosundan cortex_xdr'ı bul (status = 'active')
// 2. api_keys tablosundan key'i al, decryptApiKey() ile çöz
// 3. Son sync zamanından bu yana gelen alertleri çek
// 4. Her alert'i normalizeCortexXDR() ile dönüştür
// 5. security_events tablosuna INSERT et (ON CONFLICT DO NOTHING ile dedup)
// 6. integrations.last_sync_at ve status'u güncelle
// 7. Hata durumunda integrations.error_message güncelle

// Cortex XDR API auth hesaplama:
// const timestamp = Date.now()
// const nonce = crypto.randomBytes(64).toString('hex')
// const authString = `${apiKeyId}\n${nonce}\n${timestamp}`
// const signature = createHmac('sha256', apiKey).update(authString).digest('hex')
// Headers: { 'x-xdr-auth-id': apiKeyId, 'x-xdr-nonce': nonce, 
//            'x-xdr-timestamp': timestamp, 'x-xdr-signature': signature }

// RepeatableJob olarak kaydedilmeli (her poll_interval_sec'de bir)
// Export: registerCortexXDRWorker(connection: IORedis): void
```

---

#### GÖREV 4: Palo Alto Panorama Collector Worker
**Dosya:** `apps/backend/src/workers/collectors/panorama.ts`

```typescript
// BullMQ Worker — Palo Alto Panorama REST API'den veri çeker

// Panorama API:
// GET https://{base_url}/api/?type=log&log-type=traffic&action=get
// GET https://{base_url}/api/?type=log&log-type=threat&action=get
// Auth: ?key={api_key} query parametresi olarak

// İşlem sırası:
// 1. integrations tablosundan panorama'yı bul
// 2. api_key'i çöz
// 3. threat loglarını çek (log-type=threat daha önemli)
// 4. traffic loglarında engellenen bağlantıları çek (action=deny)
// 5. normalizePanorama() ile dönüştür
// 6. security_events'e kaydet
// 7. Son sync güncelle

// Panorama XML yanıtını parse etmek gerekebilir (xml2js kullan veya basit regex)
// Alternatif: Panorama Elasticsearch forwarder kullanıyorsa JSON olur

// Export: registerPanoramaWorker(connection: IORedis): void
```

---

#### GÖREV 5: FortiMail Collector Worker
**Dosya:** `apps/backend/src/workers/collectors/fortimail.ts`

```typescript
// BullMQ Worker — FortiMail API'den veri çeker

// FortiMail REST API:
// POST https://{base_url}/api/v1/AdminLogin — session token al
// GET  https://{base_url}/api/v1/Monitor/Log/query?log_type=history&time_period=last_hour
// Auth: Session token cookie veya Authorization header

// İşlem sırası:
// 1. Login endpoint'ten session token al
// 2. Karantina ve history loglarını çek
// 3. normalizeFortiMail() ile dönüştür
// 4. Email tehditlerini (virus, spam, phishing) security_events'e kaydet
// 5. Session token'ı Redis'e cache'le (TTL: 3600s) — her seferinde login yapma

// Önemli log alanları:
// virus_name, disposition (reject/quarantine/deliver), 
// client_ip, from, to, subject, time, date

// Export: registerFortiMailWorker(connection: IORedis): void
```

---

#### GÖREV 6: Zabbix Collector Worker (Özel — Tamamen Kod Tabanlı)
**Dosya:** `apps/backend/src/workers/collectors/zabbix.ts`

```typescript
// BullMQ Worker — Zabbix JSON-RPC 2.0 API ile iletişim

// Zabbix API Detayları:
// URL: https://{base_url}/api_jsonrpc.php
// Method: POST, Content-Type: application/json
// Auth: user.login → authToken al, tüm sonraki isteklerde kullan

// Adım 1 - Auth:
// { "jsonrpc":"2.0", "method":"user.login", 
//   "params":{"username":"..","password":".."},"id":1 }

// Adım 2 - Host listesi:
// { "jsonrpc":"2.0", "method":"host.get",
//   "params":{"output":["hostid","host","name","status"],
//             "selectInterfaces":["ip"]}, "auth": authToken, "id":2 }

// Adım 3 - Problem/Trigger'ları çek (aktif problemler):
// { "jsonrpc":"2.0", "method":"problem.get",
//   "params":{"output":"extend","selectHosts":["hostid","host","name"],
//             "recent":true,"time_from": lastSyncTimestamp},
//   "auth": authToken, "id":3 }

// Adım 4 - Sistem metrikleri (CPU, RAM, disk, uptime):
// { "jsonrpc":"2.0", "method":"history.get",
//   "params":{"output":"extend","itemids":[...], 
//             "time_from": lastSyncTimestamp,"time_till": now,
//             "sortfield":"clock","sortorder":"DESC","limit":1000},
//   "auth": authToken, "id":4 }

// Adım 5 - Item'ları bul (hangi item = CPU, RAM vs.):
// { "jsonrpc":"2.0", "method":"item.get",
//   "params":{"output":["itemid","name","key_","units","lastvalue"],
//             "hostids":[...],
//             "search":{"key_":"system.cpu.util,vm.memory,vfs.fs.size"}},
//   "auth":authToken, "id":5 }

// Metrikleri system_metrics tablosuna kaydet:
// metric_name örnekleri: "cpu_usage", "memory_used_percent", 
//                        "disk_used_percent", "uptime_seconds"

// Problem'leri normalizeZabbix() ile security_events'e kaydet

// authToken'ı Redis'e cache'le (TTL: 3600s)

// Export: registerZabbixWorker(connection: IORedis): void
// Export: getZabbixHosts(): Promise<ZabbixHost[]> — diğer route'lardan çağrılabilir
```

---

#### GÖREV 7: VirusTotal Scanner Worker
**Dosya:** `apps/backend/src/workers/collectors/virustotal.ts`

```typescript
// BullMQ Worker — On-demand VirusTotal hash tarama

// VirusTotal API v3:
// GET https://www.virustotal.com/api/v3/files/{hash}
// Header: x-apikey: {api_key}

// Job data: { hash: string, hashType: 'sha256'|'md5'|'sha1', userId: string }

// İşlem sırası:
// 1. Önce vt_scans tablosunda hash var mı kontrol et
//    - 24 saatten yeni kayıt varsa API'ye gitme, mevcut sonucu döndür
// 2. VT API'ye GET isteği at
// 3. Yanıtı parse et:
//    - data.attributes.last_analysis_stats.malicious → malicious_count
//    - data.attributes.last_analysis_stats.suspicious → suspicious_count
//    - data.attributes.last_analysis_stats.harmless → harmless_count
//    - data.attributes.last_analysis_stats.undetected → undetected_count
//    - Toplam engine sayısı = malicious + suspicious + harmless + undetected
// 4. Verdict belirle:
//    - malicious_count >= 3 → 'malicious'
//    - suspicious_count >= 3 → 'suspicious'
//    - malicious_count === 0 && suspicious_count === 0 → 'clean'
//    - else → 'unknown'
// 5. vt_scans tablosuna kaydet (ON CONFLICT (hash) DO UPDATE)
// 6. WebSocket üzerinden sonucu ilgili kullanıcıya gönder

// Rate limit: VT free API = 4 istek/dakika
// BullMQ'da limiter: { max: 4, duration: 60000 } kullan

// Export: registerVirusTotalWorker(connection: IORedis): void
// Export: scanHash(hash: string, hashType: HashType, userId: string): Promise<string> — job id döner
```

---

#### GÖREV 8: Sistem Metrikleri Route
**Dosya:** `apps/backend/src/routes/metrics.ts`

```typescript
// GET /api/metrics/hosts
// Zabbix'ten alınan tüm host'ların listesi
// Permissions: view_system_metrics

// GET /api/metrics/hosts/:hostId/timeline
// Query params: metric_name, from, to, interval (15min/1h/6h/1d)
// TimescaleDB time_bucket ile aggregation
// Permissions: view_system_metrics

// GET /api/metrics/summary
// Tüm sistemlerin anlık durumu (online/offline, son değerler)
// Her host için: cpu_usage, memory_used_percent, disk_used_percent, uptime
// Permissions: view_system_metrics

// GET /api/metrics/uptime
// Sistemlerin uptime yüzdesi (son 24 saat, 7 gün, 30 gün)
// Permissions: view_executive_dashboard

// Örnek sorgu (time_bucket):
// SELECT time_bucket('1 hour', time) as bucket, 
//        AVG(value) as avg_value, MAX(value) as max_value
// FROM system_metrics
// WHERE host_id = $1 AND metric_name = $2 
//   AND time >= $3 AND time <= $4
// GROUP BY bucket ORDER BY bucket ASC
```

---

#### GÖREV 9: VirusTotal Route
**Dosya:** `apps/backend/src/routes/virustotal.ts`

```typescript
// POST /api/virustotal/scan
// Body: { hash: string, hashType?: 'sha256'|'md5'|'sha1' }
// hashType otomatik detect edilebilir:
//   - 32 karakter → md5
//   - 40 karakter → sha1
//   - 64 karakter → sha256
// Job'ı kuyruğa ekler, jobId döner
// Permissions: trigger_virustotal

// GET /api/virustotal/result/:hash
// Önce vt_scans tablosunu kontrol et
// Yoksa "pending" döndür
// Permissions: trigger_virustotal

// GET /api/virustotal/history
// Geçmiş tüm taramalar (sayfalanmış)
// Permissions: trigger_virustotal

// DELETE /api/virustotal/:hash
// Tarama kaydını sil (force rescan için)
// Permissions: manage_integrations
```

---

#### GÖREV 10: Alert Kuralları Route
**Dosya:** `apps/backend/src/routes/alertRules.ts`

```typescript
// GET /api/alert-rules — Tüm kuralları listele
// POST /api/alert-rules — Yeni kural oluştur
// PUT /api/alert-rules/:id — Kural güncelle
// DELETE /api/alert-rules/:id — Kural sil
// PATCH /api/alert-rules/:id/toggle — Aktif/pasif et

// Kural şeması (Zod):
// name: string
// description: string
// integration_name?: string (null = tüm entegrasyonlar)
// event_type?: string
// severity_threshold: 1-10
// condition: { 
//   count_threshold?: number,  // X dakikada Y'den fazla olay
//   time_window_minutes?: number 
// }
// action: 'notify' | 'log' | 'notify_and_log'
// notify_channels: string[] (örn: ['email:admin@soar.local', 'slack:#alerts'])
// is_active: boolean

// Permissions: manage_alert_rules
```

---

#### GÖREV 11: Rapor Oluşturma Servisi
**Dosya:** `apps/backend/src/services/reportGenerator.ts`

```typescript
// Puppeteer ile PDF oluşturur

// generateReport(params: {
//   type: 'daily' | 'weekly' | 'monthly',
//   targetRole: 'c_level' | 'analyst' | 'all',
//   periodStart: Date,
//   periodEnd: Date,
//   generatedBy?: string
// }): Promise<string>  // PDF dosya yolunu döner

// PDF içeriği (C-Level için):
// - Kapak sayfası (logo, dönem, tarih)
// - Yönetici özeti (toplam tehdit, engellenen saldırı, uptime)
// - Kritik olaylar (son 5 kritik olay)
// - Sistem durumu özeti (tablo)
// - Trend grafiği (basit text-based)

// PDF içeriği (Analist için):
// - Tüm entegrasyon özeti
// - Severity dağılımı tablosu
// - En çok tetiklenen kural tipleri
// - Top 10 kaynak IP
// - Çözüme kavuşturulan olaylar
// - VirusTotal tarama özeti

// HTML şablonu oluştur, Puppeteer ile PDF'e dönüştür
// PDF'i /reports/{type}_{tarih}_{role}.pdf olarak kaydet
// reports tablosuna kayıt ekle

// Puppeteer kurulumu:
// const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
// const page = await browser.newPage()
// await page.setContent(htmlContent, { waitUntil: 'networkidle0' })
// await page.pdf({ path: outputPath, format: 'A4', printBackground: true })
```

---

#### GÖREV 12: Rapor Route
**Dosya:** `apps/backend/src/routes/reports.ts`

```typescript
// GET /api/reports — Rapor listesi (sayfalanmış)
// POST /api/reports/generate — Manuel rapor oluştur (queue'ya ekle)
// GET /api/reports/:id/download — PDF indir (stream)
// DELETE /api/reports/:id — Rapor sil

// Body (generate):
// { type: 'daily'|'weekly'|'monthly', targetRole: 'c_level'|'analyst'|'all' }

// Download için:
// reply.header('Content-Type', 'application/pdf')
// reply.header('Content-Disposition', `attachment; filename="${report.id}.pdf"`)
// const stream = fs.createReadStream(report.pdf_path)
// return reply.send(stream)

// Permissions: view_reports (GET), generate_reports (POST)
```

---

#### GÖREV 13: Rapor Zamanlanmış Worker
**Dosya:** `apps/backend/src/workers/reports/scheduler.ts`

```typescript
// node-cron ile otomatik rapor tetikleme

// Günlük rapor: Her gün 07:00'de (Türkiye saati = UTC+3)
// Cron: '0 4 * * *'  (UTC 04:00 = TR 07:00)

// Haftalık rapor: Her Pazartesi 07:00'de
// Cron: '0 4 * * 1'

// Aylık rapor: Her ayın 1'inde 07:00'de
// Cron: '0 4 1 * *'

// Her cron job şunları yapar:
// 1. report_generator queue'ya job ekle
// 2. Hem c_level hem analyst için ayrı rapor oluştur

// Export: startReportScheduler(): void
```

---

#### GÖREV 14: WebSocket Yöneticisi
**Dosya:** `apps/backend/src/services/websocket.ts`

```typescript
// @fastify/websocket ile gerçek zamanlı bildirimler

// Olaylar (server → client):
// 'new_event'    — Yeni güvenlik olayı geldiğinde
// 'vt_result'    — VirusTotal tarama sonucu
// 'integration_status' — Entegrasyon durumu değişince
// 'alert'        — Alert kuralı tetiklenince

// Kullanıcı bazlı filtreleme:
// Her WebSocket bağlantısı JWT ile auth edilmeli
// c_level kullanıcıları yalnızca severity >= 7 event'leri alır
// analyst kullanıcıları tüm event'leri alır

// Fonksiyonlar:
// broadcast(event: string, data: unknown, roleFilter?: RoleName[]): void
// sendToUser(userId: string, event: string, data: unknown): void
// getConnectedCount(): number

// Bağlantı örneği:
// ws://localhost:3001/ws?token={accessToken}
```

---

#### GÖREV 15: Denetim Logları Route
**Dosya:** `apps/backend/src/routes/audit.ts`

```typescript
// GET /api/audit
// Query params: user_id, action, from, to, page, limit
// Permissions: view_audit_logs

// Tüm kullanıcı işlemlerini gösterir (kim, ne zaman, ne yaptı, hangi IP)
```

---

#### GÖREV 16: Ana Fastify Server
**Dosya:** `apps/backend/src/index.ts`

```typescript
// Tüm plugin'leri ve route'ları birleştiren ana dosya

// Sıra:
// 1. dotenv yükle
// 2. Fastify instance oluştur (logger: true)
// 3. Plugin'leri kaydet:
//    - @fastify/helmet (güvenlik header'ları)
//    - @fastify/cors (FRONTEND_URL'e izin ver)
//    - @fastify/rate-limit (100 req/dk genel, auth route'ları için 5/dk)
//    - @fastify/jwt (secret: JWT_SECRET)
//    - @fastify/websocket
// 4. Route'ları kaydet:
//    - /api/auth → authRoutes
//    - /api/users → usersRoutes
//    - /api/integrations → integrationsRoutes
//    - /api/events → eventsRoutes
//    - /api/metrics → metricsRoutes
//    - /api/virustotal → virusTotalRoutes
//    - /api/alert-rules → alertRulesRoutes
//    - /api/reports → reportsRoutes
//    - /api/audit → auditRoutes
// 5. WebSocket handler'ı bağla (/ws endpoint)
// 6. Worker'ları başlat:
//    - registerCortexXDRWorker
//    - registerPanoramaWorker
//    - registerFortiMailWorker
//    - registerZabbixWorker
//    - registerVirusTotalWorker
// 7. Cron scheduler'ı başlat
// 8. Graceful shutdown (SIGTERM, SIGINT)
// 9. Listen: 0.0.0.0:${PORT}

// Health check endpoint:
// GET /health → { status: 'ok', db: 'ok', redis: 'ok', timestamp: ... }
```

---

#### GÖREV 17: Backend Dockerfile
**Dosya:** `apps/backend/Dockerfile`

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
# Puppeteer için chromium bağımlılıkları
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
RUN mkdir -p logs reports
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

---

### ═══════════════════════════════════
### FAZ 2 — FRONTEND (Next.js 14)
### ═══════════════════════════════════

---

#### GÖREV 18: Frontend Kurulum Dosyaları

**`apps/frontend/package.json`:**
```json
{
  "name": "@soar/frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "typescript": "^5.3.3",
    "@types/node": "^20.11.20",
    "@types/react": "^18.2.57",
    "@types/react-dom": "^18.2.19",
    "tailwindcss": "^3.4.1",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.35",
    "zustand": "^4.5.2",
    "@tanstack/react-query": "^5.20.5",
    "axios": "^1.6.7",
    "recharts": "^2.12.2",
    "socket.io-client": "^4.7.4",
    "react-hook-form": "^7.51.0",
    "zod": "^3.22.4",
    "@hookform/resolvers": "^3.3.4",
    "date-fns": "^3.3.1",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.1",
    "lucide-react": "^0.341.0",
    "next-themes": "^0.2.1",
    "sonner": "^1.4.3"
  }
}
```

**`apps/frontend/next.config.js`:**
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ]
  },
}
module.exports = nextConfig
```

**`apps/frontend/tailwind.config.js`** — shadcn/ui uyumlu tam config yaz

**`apps/frontend/src/lib/utils.ts`** — `cn()` yardımcı fonksiyonu (clsx + tailwind-merge)

---

#### GÖREV 19: API Client ve Auth Store
**Dosya:** `apps/frontend/src/lib/api.ts`

```typescript
// axios instance oluştur
// Base URL: process.env.NEXT_PUBLIC_API_URL
// Request interceptor: Authorization header'a accessToken ekle
// Response interceptor: 401 aldığında refreshToken ile yenile
//   - Yeni token alınamazsa login sayfasına yönlendir
// Tüm API endpoint'leri için tiplenmiş fonksiyonlar:
//   - auth: login(), logout(), refresh(), getMe()
//   - events: getEvents(params), getEvent(id), resolveEvent(id), getEventStats(), getTimeline()
//   - integrations: getIntegrations(), updateIntegration(), syncIntegration()
//   - metrics: getHosts(), getHostTimeline(), getMetricsSummary()
//   - virustotal: scanHash(), getScanResult(), getScanHistory()
//   - reports: getReports(), generateReport(), downloadReport()
//   - users: getUsers(), createUser(), updateUser(), deleteUser()
//   - audit: getAuditLogs()
```

**Dosya:** `apps/frontend/src/lib/store.ts`

```typescript
// Zustand store
// authStore: { user, accessToken, refreshToken, setAuth, clearAuth }
// Token'ları localStorage'da sakla (SSR uyumlu — typeof window check)
```

---

#### GÖREV 20: Next.js App Yapısı

**`apps/frontend/src/app/layout.tsx`** — Root layout (QueryClientProvider, ThemeProvider, Toaster)

**`apps/frontend/src/app/login/page.tsx`:**
```
- E-posta + şifre formu (react-hook-form + zod)
- Hata mesajları
- Başarılı girişte role'e göre yönlendirme:
  - c_level → /executive
  - analyst → /analyst  
  - admin/super_admin → /analyst (varsayılan)
- Kipaş Holding / SOAR Platform logosu ve branding
- Karanlık/aydınlık tema desteği
```

**`apps/frontend/src/app/(dashboard)/layout.tsx`:**
```
- Sol sidebar (collapsed/expanded)
- Üst header (kullanıcı adı, rol badge, çıkış)
- Sidebar menü öğeleri role'e göre filtrelenmiş (permissions'a bakarak)
- WebSocket bağlantısı kur (app genelinde)
- Aktif route'u vurgula
```

---

#### GÖREV 21: C-Level Executive Dashboard
**Dosya:** `apps/frontend/src/app/(dashboard)/executive/page.tsx`

```
Yalnızca view_executive_dashboard yetkisine sahip kullanıcılar görebilir.
Permissions kontrolü: useAuth hook'u ile client-side + middleware ile server-side

Bileşenler:
1. KPI Kartları (üst satır, 4 kart yan yana):
   - Bugünkü Toplam Tehdit (kırmızı/sarı — seviyeye göre renk)
   - Engellenen Saldırı (mavi)
   - Sistemlerin Genel Uptime (yeşil)
   - Kritik Açık Olay Sayısı (turuncu)

2. Tehdit Trend Grafiği (Recharts - AreaChart):
   - Son 7 günün saatlik event sayıları
   - Kritik (>= 7 severity) ve toplam olayları farklı renkte

3. Entegrasyon Durumu (küçük kartlar — yatay liste):
   - Cortex XDR / Panorama / FortiMail / Zabbix
   - Her biri: renk (yeşil=aktif, kırmızı=hata, gri=disabled), son sync

4. Son 5 Kritik Olay (tablo):
   - Zaman, Kaynak, Tip, Severity badge (renk kodlu)
   - Satır tıklanamaz (c_level detay görmez)

5. Sistem Uptime Özeti (yatay çubuk grafik):
   - Her sistem için uptime yüzdesi

Veri: Her 60 saniyede bir yenile (TanStack Query refetchInterval)
Gerçek zamanlı: WebSocket'ten 'new_event' geldiğinde KPI'ları güncelle
```

---

#### GÖREV 22: Analist Operasyon Paneli
**Dosya:** `apps/frontend/src/app/(dashboard)/analyst/page.tsx`

```
view_analyst_dashboard yetkisi gerekli.

Bileşenler:
1. Filtre Çubuğu:
   - Zaman aralığı (son 1s/6s/24s/7g/30g veya custom)
   - Severity (çoklu seçim: 1-3 Düşük, 4-6 Orta, 7-8 Yüksek, 9-10 Kritik)
   - Entegrasyon (dropdown)
   - Olay tipi (dropdown)
   - Kaynak IP (text input)
   - Çözüm durumu (toggle: Tümü/Açık/Kapalı)
   - Arama (title/description full-text)

2. Özet Bar (filtre altında):
   - Toplam olay sayısı, kritik olay sayısı, çözüme bekleyen

3. Olay Tablosu (ana içerik):
   - Sütunlar: Zaman | Kaynak | Hedef | Tip | Severity | Entegrasyon | Durum | İşlem
   - Severity renk kodlu badge (1-3 mavi, 4-6 sarı, 7-8 turuncu, 9-10 kırmızı)
   - Satıra tıklayınca sağ panel açılır (drawer)
   - Sayfalama (50/100/200 satır seçeneği)
   - Sıralama (zaman, severity)

4. Olay Detay Drawer (sağ panel):
   - Tüm olay alanları
   - Ham payload (JSON viewer — genişletilebilir)
   - "Çözüldü Olarak İşaretle" butonu + not alanı
   - IP adresi → "VirusTotal'da Ara" kısayolu (IP reputation değil, bağlantı için)

5. Cihaz Bazlı Drill-Down:
   - Tablo satırından host_name'e tıklayınca o host'un timeline'ı
   - O host'un son 24 saatteki tüm olayları

6. WebSocket feed: Yeni olay gelince tablonun en üstüne ekle (animasyonla)
   Analist için severity filtresi yok — tüm olaylar görünür

```

---

#### GÖREV 23: VirusTotal UI Modülü
**Dosya:** `apps/frontend/src/app/(dashboard)/virustotal/page.tsx`

```
trigger_virustotal yetkisi gerekli.

Bileşenler:
1. Hash Tarama Formu:
   - Büyük input alanı (SHA256/MD5/SHA1 gir)
   - Hash tipi otomatik algıla (karakter sayısına göre)
   - "Tara" butonu
   - Tarama sırasında loading spinner
   - WebSocket ile sonuç bekleme (jobId üzerinden)

2. Sonuç Kartı:
   - Büyük verdict badge (TEMİZ/ŞÜPHELİ/KÖTÜCÜL/BİLİNMİYOR)
   - Renk: yeşil/sarı/kırmızı/gri
   - Malicious/Suspicious/Clean/Undetected sayıları (radial chart)
   - Dosya bilgileri (varsa: ad, tip, boyut)
   - Tarama tarihi

3. Geçmiş Taramalar Tablosu:
   - Hash | Verdict | Malicious/Total | Tarih | Tarayan
   - Verdict renk kodlu badge
   - Satıra tıklayınca detay

4. Cache uyarısı: "Bu hash 3 saat önce tarandı, önbellekten gösteriliyor"

Not: VirusTotal API key admin tarafından integrations sayfasından girilmiş olmalı.
Yoksa "API anahtarı tanımlı değil" mesajı göster ve settings sayfasına yönlendir.
```

---

#### GÖREV 24: Sistem Metrikleri Sayfası
**Dosya:** `apps/frontend/src/app/(dashboard)/systems/page.tsx`

```
view_system_metrics yetkisi gerekli.

Bileşenler:
1. Host Grid (kart listesi):
   - Her Zabbix host için kart
   - Online/Offline durumu (yeşil/kırmızı nokta)
   - CPU, RAM, Disk kullanım gauge/progress bar
   - Son güncelleme zamanı

2. Host Detay Modal/Sayfa:
   - 4 grafik yan yana: CPU, RAM, Disk, Network I/O
   - Zaman aralığı seçici (son 1s/6s/24s/7g)
   - Recharts LineChart — smooth eğri
   - Kritik eşik çizgisi (CPU > 90% için kırmızı referans çizgisi)

3. Uptime Tablosu:
   - Son 24s / 7 gün / 30 gün uptime yüzdeleri
   - SLA badge (>99.9% yeşil, >99% sarı, <99% kırmızı)
```

---

#### GÖREV 25: Raporlar Sayfası
**Dosya:** `apps/frontend/src/app/(dashboard)/reports/page.tsx`

```
view_reports yetkisi gerekli.

Bileşenler:
1. Rapor Oluştur Bölümü (generate_reports yetkisi olanlar için):
   - Tip seçimi (Günlük/Haftalık/Aylık)
   - Hedef kitle (C-Level/Analist/Tümü)
   - "Oluştur" butonu → queue'ya ekler, "Hazırlanıyor..." gösterir

2. Rapor Listesi:
   - Tip | Dönem | Hedef | Oluşturulma tarihi | Boyut | İndir
   - İndir → PDF direkt download tetikler
   - loading state: oluşturulma sırasında spinner

3. Otomatik rapor takvimi bilgisi:
   - "Günlük raporlar her gün 07:00'de otomatik oluşturulur"
```

---

#### GÖREV 26: Ayarlar Sayfası
**Dosya:** `apps/frontend/src/app/(dashboard)/settings/page.tsx`

```
Sekmeli yapı:

Sekme 1 — Entegrasyonlar (manage_integrations yetkisi):
  Her entegrasyon için kart:
  - Durum toggle (aktif/pasif)
  - Base URL input
  - Poll interval input
  - API Key Yönetimi:
    - Mevcut key'leri listele (değer gösterilmez, sadece isim+tarih)
    - Yeni key ekle (isim + değer)
    - Key sil
  - "Bağlantıyı Test Et" butonu
  - "Manuel Senkronizasyon" butonu

Sekme 2 — Kullanıcılar (manage_users yetkisi):
  - Kullanıcı tablosu
  - Yeni kullanıcı ekle (modal)
  - Kullanıcı düzenle (rol değiştir, aktif/pasif)
  - Kullanıcı devre dışı bırak

Sekme 3 — Alert Kuralları (manage_alert_rules yetkisi):
  - Kural listesi
  - Yeni kural ekle
  - Aktif/pasif toggle

Sekme 4 — Profil (herkes):
  - Şifre değiştir
```

---

#### GÖREV 27: Ortak UI Bileşenleri
**Klasör:** `apps/frontend/src/components/`

Yazılacak bileşenler:
```
ui/
  Button.tsx          — variant (primary/secondary/danger/ghost), size, loading state
  Input.tsx           — label, error, icon support
  Badge.tsx           — severity'e göre renk (1-3 mavi, 4-6 sarı, 7-8 turuncu, 9-10 kırmızı)
  Card.tsx            — başlık, içerik, alt bölüm
  Table.tsx            — sıralama, sayfalama, loading skeleton
  Modal.tsx           — portal tabanlı, ESC ile kapat
  Drawer.tsx          — sağdan açılan panel (olay detayı için)
  JsonViewer.tsx      — JSON objesini güzel formatlı göster, genişlet/daralt
  LoadingSkeleton.tsx — card/tablo loading placeholder
  StatusDot.tsx       — yeşil/sarı/kırmızı animasyonlu nokta

dashboard/
  KPICard.tsx         — büyük sayı, etiket, trend ok, renk
  SeverityBadge.tsx   — 1-10 severity → renk + etiket
  IntegrationStatus.tsx — entegrasyon kartı (durum, son sync)

charts/
  AreaTimelineChart.tsx  — Recharts AreaChart wrapper
  BarChart.tsx           — Recharts BarChart wrapper
  DonutChart.tsx         — Recharts PieChart (donut) wrapper
  GaugeChart.tsx         — CPU/RAM için basit progress gauge

layout/
  Sidebar.tsx         — navigasyon menüsü
  Header.tsx          — üst bar
  PageHeader.tsx      — sayfa başlığı + breadcrumb
```

---

#### GÖREV 28: Custom Hook'lar
**Klasör:** `apps/frontend/src/hooks/`

```typescript
// useAuth.ts — Zustand auth store wrapper, permissions check
// useWebSocket.ts — socket.io-client bağlantısı, event listener'lar
// useEvents.ts — TanStack Query ile event listesi + filtreler
// useMetrics.ts — sistem metrikleri sorguları
// useVirusTotal.ts — hash tarama + WebSocket ile sonuç bekleme
// usePermission.ts — (permission: string) => boolean
//   Kullanım: if (!hasPermission('manage_users')) return <Unauthorized />
```

---

#### GÖREV 29: Route Koruması (Middleware)
**Dosya:** `apps/frontend/src/middleware.ts`

```typescript
// Next.js middleware
// /executive → view_executive_dashboard yoksa /analyst'e yönlendir
// /analyst → view_analyst_dashboard yoksa /executive'e yönlendir
// Login gerektiren tüm sayfalar → token yoksa /login'e yönlendir
// Token'ı cookie'den oku (httpOnly değil, client readable)
```

---

#### GÖREV 30: Frontend Dockerfile
**Dosya:** `apps/frontend/Dockerfile`

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT 3000
CMD ["node", "server.js"]
```

---

## 🚀 PROJEYI ÇALIŞTIRMA

Claude'a şunu söyle: "Bu adımları sırayla uygula:"

```bash
# 1. Bağımlılıkları yükle
cd soar-platform
npm install

# 2. docker/.env dosyasını oluştur
cp docker/.env.example docker/.env
# .env içindeki şifreleri doldur

# 3. Backend .env oluştur
cp apps/backend/.env.example apps/backend/.env
# .env içindeki değerleri doldur

# 4. Docker servisleri başlat
npm run docker:up

# 5. Migration ve seed çalıştır
npm run db:migrate
# (seed otomatik migration içinde çalışır)

# 6. Geliştirme modunda başlat
npm run dev
```

---

## 📌 ÖNEMLİ NOTLAR (Agent için)

1. **Mevcut dosyalara dokunma** — `MEVCUT DOSYALAR` bölümündeki tüm dosyalar zaten yazılmış. Üzerine yazma.

2. **Tip tutarlılığı** — `types/index.ts` dosyasındaki tipleri kullan. Yeni tip tanımlama.

3. **Şifreleme** — API key değerleri asla veritabanında düz metin olarak saklanmamalı. Her zaman `encryptApiKey()` kullan.

4. **Error handling** — Tüm async fonksiyonlarda try/catch kullan. Hatayı yakala, logla, anlamlı hata mesajı döndür.

5. **Rate limiting** — VirusTotal worker'ında `limiter: { max: 4, duration: 60000 }` zorunlu.

6. **WebSocket auth** — Her WebSocket bağlantısında `?token=` query parametresindeki JWT'yi doğrula.

7. **TimescaleDB** — `security_events` ve `system_metrics` tablolarına INSERT yaparken `time` alanını mutlaka ekle. `time_bucket()` ile aggregation yapılacak — `time` alanı index'li.

8. **Zabbix API** — JSON-RPC 2.0 kullanır. `user.login` → authToken al → tüm sonraki çağrılarda `"auth": token` parametresi ekle.

9. **Cortex XDR auth** — HMAC-SHA256 imzası gerekiyor (Görev 3'te detaylandırıldı). Standart Bearer token değil.

10. **PDF raporlar** — Puppeteer'ı Docker'da çalıştırırken `--no-sandbox` argümanı zorunlu (Dockerfile'da Chromium kurulumu gerekli).

---

## 🎯 AGENT'A VERECEĞİN KOMUT

VS Code'da Claude Code'u açtıktan sonra şunu söyle:

> "soar-platform klasörünü aç. SOAR_PLATFORM_PLAN.md dosyasını oku. 
> Mevcut dosyalara dokunmadan, YAZILACAK DOSYALAR bölümündeki görevleri 
> sırayla tamamla. Her görevi bitirdikten sonra bir sonrakine geç. 
> GÖREV 1'den başla."
