# SOAR Platform

SOAR Platform, guvenlik olaylarini merkezi olarak toplamak, normalize etmek, analiz etmek ve raporlamak icin gelistirilmis bir monorepo projedir.

## Ozellikler

- Rol tabanli kimlik dogrulama (JWT + RBAC)
- Guvenlik olaylari toplama ve analiz
- Entegrasyon yonetimi (API anahtari saklama dahil)
- VirusTotal hash tarama
- Sistem metrikleri ve uptime gorunumu
- Denetim loglari (audit trail)
- PDF rapor uretimi ve zamanlanmis raporlar
- WebSocket ile canli guncellemeler

## Teknoloji Yigini

- Frontend: Next.js 14, TypeScript, Tailwind CSS, Zustand, React Query
- Backend: Fastify, TypeScript, BullMQ, Redis, PostgreSQL/TimescaleDB
- Altyapi: Docker Compose (TimescaleDB + Redis + Backend + Frontend)

## Proje Yapisi

```text
soar-platform/
|- apps/
|  |- backend/     # Fastify API, queue workers, migrations
|  `- frontend/    # Next.js dashboard UI
|- docker/
|  |- docker-compose.yml
|  `- .env.example
|- package.json    # Monorepo workspace ve root scriptleri
`- SOAR_PLATFORM_PLAN.md
```

## Gereksinimler

- Node.js 20+
- npm 9+
- Docker + Docker Compose (opsiyonel ama onerilir)

## Hizli Baslangic (Lokal Gelistirme)

1. Bagimliliklari yukleyin:

```bash
npm install
```

2. Ortam degiskenlerini hazirlayin:

```bash
copy docker\.env.example docker\.env
copy apps\backend\.env.example apps\backend\.env
```

3. Altyapi servislerini ayaga kaldirin (DB + Redis):

```bash
npm run docker:up
```

4. Veritabani migration calistirin:

```bash
npm run db:migrate
```

5. Varsayilan kullanicilari olusturun:

```bash
npm run seed --workspace=apps/backend
```

6. Uygulamayi gelistirme modunda baslatin:

```bash
npm run dev
```

Uygulama adresleri:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`
- Health: `http://localhost:3001/health`

## Docker ile Calistirma

Tum servisleri Docker ile baslatmak icin:

```bash
npm run docker:up
```

Durdurmak icin:

```bash
npm run docker:down
```

> Not: Docker backend servisi production modunda calisir. Ilk kurulumda environment degerlerini `docker\.env` dosyasinda guncellemeyi unutmayin.

## Ortam Degiskenleri

### `docker/.env.example`

- `DB_PASSWORD`
- `REDIS_PASSWORD`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `ENCRYPTION_KEY`

### `apps/backend/.env.example`

- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `ENCRYPTION_KEY`
- `FRONTEND_URL`
- `VIRUSTOTAL_API_KEY` (opsiyonel)

## Varsayilan Kullanicilar (Seed)

`apps/backend/src/db/seed.ts` icindeki varsayilan hesaplar:

- `admin@soar.local` / `Admin@2024!` (super_admin)
- `mehmet@soar.local` / `Manager@2024!` (c_level)
- `analyst@soar.local` / `Analyst@2024!` (analyst)

> Guvenlik icin, bu sifreleri gelistirme disi ortamlarda mutlaka degistirin.

## NPM Scriptleri

Root (`package.json`):

- `npm run dev` -> frontend + backend birlikte calisir
- `npm run build` -> backend ve frontend build alir
- `npm run db:migrate` -> backend migration calistirir
- `npm run docker:up` -> docker compose up
- `npm run docker:down` -> docker compose down

Backend (`apps/backend/package.json`):

- `npm run dev --workspace=apps/backend`
- `npm run build --workspace=apps/backend`
- `npm run start --workspace=apps/backend`
- `npm run migrate --workspace=apps/backend`
- `npm run seed --workspace=apps/backend`

Frontend (`apps/frontend/package.json`):

- `npm run dev --workspace=apps/frontend`
- `npm run build --workspace=apps/frontend`
- `npm run start --workspace=apps/frontend`

## API Ozeti

Backend, asagidaki temel endpoint gruplarini sunar:

- `/api/auth`
- `/api/users`
- `/api/integrations`
- `/api/events`
- `/api/metrics`
- `/api/virustotal`
- `/api/alert-rules`
- `/api/reports`
- `/api/audit`

## Gelistirme Notlari

- Monorepo `npm workspaces` kullanir.
- Queue ve worker yapisi backend altinda BullMQ ile calisir.
- TimescaleDB hypertable yapisi migration icinde tanimlidir.
- Frontend tarafi rol/izin bazli menu ve ekran filtreleme yapar.

## Lisans

Bu repo icin lisans bilgisi tanimlanmamis. Gerekirse kok dizine `LICENSE` dosyasi ekleyebilirsiniz.
