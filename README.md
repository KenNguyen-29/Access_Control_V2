# Access Control V2

Hệ thống quản lý chấm công FaceID & giám sát camera thời gian thực.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS 10 + TypeScript |
| Frontend | Next.js 15 (App Router) + TailwindCSS |
| Database | PostgreSQL 16 |
| Cache/Queue | Redis 7 + BullMQ |
| Object Storage | MinIO |
| Media Streaming | go2rtc (RTSP → WebRTC, on host) |
| Real-time | Socket.io |

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker Desktop (for PostgreSQL, Redis, MinIO)

> **Note:** First `pnpm install` requires build script approval. This repo configures `allowBuilds` in `pnpm-workspace.yaml` for Prisma, bcrypt, and other native deps.

## Quick Start

```bash
# 1. Clone & install
cp .env.example .env
pnpm install

# 2. Start infrastructure
pnpm docker:up

# 3. Database setup
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 4. Install go2rtc once (camera live view, runs on host — not Docker)
pnpm --filter @acv2/api go2rtc:install

# 5. Start dev servers (go2rtc auto-starts with the API)
pnpm dev
```

> **Camera live view:** go2rtc runs on the host (port `1984`) so WebRTC ICE
> candidates are reachable by the browser. The API spawns it automatically
> (`GO2RTC_AUTO_START=true`) and proxies the SDP exchange via
> `POST /devices/:id/webrtc`. Cameras need a real RTSP URL reachable from the
> machine running go2rtc.

## Production deploy (CI/CD)

Push `main` → GitHub Actions CI → auto deploy on self-hosted runner at `192.168.2.148`.

**One-time server setup:** [docs/DEPLOY.md](./docs/DEPLOY.md) (Docker, `.env`, GitHub runner).

After setup, every `git push origin main` deploys automatically — no manual SSH.

**Production ports (company VM):** web **3003**, API **8010** — set via `WEB_HOST_PORT` / `API_HOST_PORT` in server `.env` ([`.env.production.example`](./.env.production.example)).

## URLs

| Service | Local dev | Production (VM) |
|---------|-----------|-----------------|
| Web UI | http://localhost:3000 | http://\<VM-IP\>:3003 |
| API | http://localhost:8080/api | http://\<VM-IP\>:8010/api |
| Swagger | http://localhost:8080/api/docs | http://\<VM-IP\>:8010/api/docs |
| MinIO Console | http://localhost:9001 | (internal Docker network) |
| go2rtc API | http://127.0.0.1:1984 | http://127.0.0.1:1984 |

## Default Login

- **Username:** `admin`
- **Password:** `admin123`

## Project Structure

```
Access_Control_V2/
├── apps/
│   ├── api/          # NestJS backend
│   └── web/          # Next.js frontend
├── packages/
│   └── shared/       # Shared TypeScript types
├── docker/           # Infra configs
└── docs.md           # Architecture documentation
```

## API Modules

- `auth` — JWT authentication
- `users` — Employee management
- `departments` — Department CRUD
- `shifts` — Work shift configuration
- `devices` — Akuvox & Camera management
- `device-mappings` — Akuvox ↔ Camera linking
- `credentials` — FaceID data
- `webhooks` — Akuvox door_log HTTP receiver (+ legacy Action URL webhook)
- `attendance` — Attendance logs & reports
- `events` — WebSocket real-time events
- `health` — System health checks

## Akuvox door_log (recommended)

Configure the Akuvox panel to **HTTP push / door log** (not Action URL colon-pairs):

```
http://<API_SERVER_IP>:8010/api/akuvox/door_log
```

Example payload (Techwave-compatible):

```json
{"Type":"Face","Status":"Success","UserID":"NV-0003","Date":"2026-07-20","Time":"16:30:00"}
```

| Setting | Value |
|---------|-------|
| Device IP in Admin | Must match the panel IP (device is mapped by **HTTP client IP**) |
| UserID on panel | Must equal `employeeCode` in Users (e.g. `NV-0003`) |
| `API_PUBLIC_URL` | Base URL the panel can reach (used for face sync + webhook display) |
| `AKUVOX_MOCK_MODE` | Set `false` when syncing to a real panel |
| Windows Firewall | Allow inbound TCP **8010** (prod) or **8080** (dev) from the panel subnet |

Optional inbound security (`.env`):

```
AKUVOX_WEBHOOK_TOKEN=your-secret
AKUVOX_ALLOWED_IPS=192.168.71.186
```

**Smoke test** (mock panel IP when testing from localhost):

```bash
curl -X POST http://localhost:8080/api/akuvox/door_log \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 192.168.71.186" \
  -d '{"Type":"Face","Status":"Success","UserID":"NV-0003","Date":"2026-07-20","Time":"16:30:00"}'
```

After a scan or curl test, `GET /api/health` should show `realtime.lastWebhookAt` updating. Admin → **Devices** shows the webhook URL and a **Test webhook** button.

Face enroll auto-syncs credentials to Akuvox panels when `AKUVOX_MOCK_MODE=false`.

## Test Webhook Flow (legacy)

Legacy Action URL / colon-pairs endpoint (kept for compatibility):

```bash
curl -X POST http://localhost:8080/api/webhooks/akuvox \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "test-001",
    "employeeCode": "EMP001",
    "deviceCode": "AKUVOX-MAIN",
    "timestamp": "2026-01-15T08:00:00Z"
  }'
```

With `REDIS_ENABLED=false` (recommended for local), the webhook is processed **synchronously** in the API process, saves an AccessLog, and emits `checkin_event` over WebSocket.

With `REDIS_ENABLED=true`, the event is queued via BullMQ then processed by the in-process worker. Watch Dashboard → **Realtime** panel (`waiting` / last webhook / process / emit) or `GET /api/health` if events stall after a scan.

**Realtime tip:** keep `/dashboard` open with Socket **Online** while testing face scans. Leaving the page disconnects the live socket; reconnecting catch-ups recent logs automatically.

## Architecture

See [docs.md](./docs.md) for full system architecture, data flows, and module specifications.

## Roadmap

- [x] Full CRUD UI for admin pages
- [x] Akuvox REST API 2-way sync
- [x] Shift calculation logic (late/early/OT)
- [x] Excel report export
- [x] Production Docker Compose (API + Web containers)
