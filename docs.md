# Access Control V2 — Architecture

Hệ thống quản lý chấm công FaceID (Akuvox) và giám sát camera thời gian thực (go2rtc WebRTC, proxy SDP qua backend), monorepo NestJS + Next.js.

## High-level components

| Component | Role |
|-----------|------|
| `apps/api` | NestJS REST + Socket.io + BullMQ workers |
| `apps/web` | Next.js 15 admin + security dashboard |
| `packages/shared` | Shared types (API envelope, webhook payload, enums) |
| PostgreSQL | Primary data store (Prisma) |
| Redis | BullMQ job queue |
| MinIO | Snapshots / face images (S3 API) |
| go2rtc (host) | RTSP → WebRTC for camera grid; backend proxies SDP via `POST /devices/:id/webrtc` |

## Data flow — Akuvox webhook → attendance → live UI

```mermaid
sequenceDiagram
  participant Panel as AkuvoxPanel
  participant API as NestAPI
  participant Q as BullMQ
  participant DB as Postgres
  participant S3 as MinIO
  participant WS as SocketIO
  participant Web as SecurityDashboard

  Panel->>API: POST /api/webhooks/akuvox
  API->>Q: enqueue akuvox-events
  API-->>Panel: 202 Accepted
  Q->>API: AkuvoxEventProcessor
  API->>S3: upload snapshot (optional)
  API->>DB: upsert AccessLog
  API->>DB: upsert AttendanceRecord (late/OT)
  API->>WS: emit checkin_event
  WS->>Web: popup + mini access log
```

## Module map (`apps/api`)

- `auth` — login / refresh, JWT global guard (`@Public` for login, webhook, health)
- `users` / `departments` / `roles` — org CRUD
- `shifts` — work shifts + employee assignments + default shift
- `devices` — Akuvox/Camera CRUD, stream URL, open-door, sync-credentials
- `device-mappings` — Akuvox ↔ Camera links
- `credentials` — Face / card credential storage
- `webhooks` — inbound Akuvox HTTP receiver
- `queue` — BullMQ processor
- `attendance` — records, access logs, Excel export
- `events` — Socket.io `/events`
- `storage` — MinIO client
- `health` — postgres / redis / minio checks

## Attendance rules

1. Resolve active `EmployeeShift` for the user on that calendar day; else default work shift.
2. First punch of the day → `checkInAt`; late = minutes after `startTime + gracePeriodMinutes`.
3. Later punch → `checkOutAt`; early leave if before `endTime`; OT if after (overnight-aware).
4. `status` derived: `LATE` / `EARLY_LEAVE` / `OVERTIME` / `ON_TIME`.

## Environment

See [`.env.example`](./.env.example). Important keys:

- `DATABASE_URL`, `REDIS_HOST` / `REDIS_PORT`
- `MINIO_*`, `JWT_SECRET`
- `GO2RTC_BASE_URL`, `GO2RTC_ENABLED`, `GO2RTC_AUTO_START`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`
- `AKUVOX_MOCK_MODE` (default `true` for local without panels)

## Local development

> Docker Desktop must be running for `pnpm docker:up` (Postgres, Redis, MinIO).
> go2rtc runs on the host (not Docker); install it once, then the API auto-starts it.

```bash
cp .env.example .env
pnpm install
pnpm docker:up
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm --filter @acv2/api go2rtc:install   # once, for camera live view
pnpm dev
```

- Web: http://localhost:3000  
- API: http://localhost:8080/api  
- Swagger: http://localhost:8080/api/docs  

Default login: `admin` / `admin123`

## Production Compose

```bash
pnpm docker:prod
# or
docker compose -f docker-compose.prod.yml up -d --build
```

Builds `apps/api` and `apps/web` images and wires them to postgres, redis, minio. Camera live view still relies on go2rtc running on the host.

## API smoke tests

```bash
# Login
curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Webhook (uses seed device AKUVOX-MAIN + EMP001 when seeded)
curl -s -X POST http://localhost:8080/api/webhooks/akuvox \
  -H "Content-Type: application/json" \
  -d '{"eventId":"test-001","employeeCode":"EMP001","deviceCode":"AKUVOX-MAIN","timestamp":"2026-07-14T08:10:00Z"}'
```
