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

## URLs

| Service | URL |
|---------|-----|
| Web UI | http://localhost:3000 |
| API | http://localhost:8080/api |
| Swagger | http://localhost:8080/api/docs |
| MinIO Console | http://localhost:9001 |
| go2rtc API | http://127.0.0.1:1984 |

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
- `webhooks` — Akuvox HTTP webhook receiver
- `attendance` — Attendance logs & reports
- `events` — WebSocket real-time events
- `health` — System health checks

## Test Webhook Flow

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

This will queue the event via BullMQ, save an AccessLog, and emit a `checkin_event` via WebSocket to the security dashboard.

## Architecture

See [docs.md](./docs.md) for full system architecture, data flows, and module specifications.

## Roadmap

- [x] Full CRUD UI for admin pages
- [x] Akuvox REST API 2-way sync
- [x] Shift calculation logic (late/early/OT)
- [x] Excel report export
- [x] Production Docker Compose (API + Web containers)
