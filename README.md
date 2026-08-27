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
> candidates are discovered from the active network interfaces. The API spawns
> it automatically (`GO2RTC_AUTO_START=true`) and proxies the SDP exchange via
> `POST /devices/:id/webrtc`. Cameras need a real RTSP URL reachable from the
> machine running go2rtc.

> **ONVIF discovery:** the API runs WS-Discovery directly on every local IPv4
> interface and resolves Media1/Media2 profiles in the same Windows process.
> A routed L3 VPN must carry/forward WS-Discovery multicast (`239.255.255.250:3702`)
> for automatic remote discovery; otherwise enter the known device IP and use
> **Lấy profile** (the app does not scan subnets).

> **Port note:** ONVIF and RTSP use the ports returned by the camera. The
> application does not rewrite them: a typical camera stores ONVIF `80` and
> RTSP `554` (or the exact port present in the profile URI).

## Production deploy (CI/CD)

Push `main` → GitHub Actions CI → auto deploy on a self-hosted runner installed on the target server.

**One-time server setup:** [docs/DEPLOY.md](./docs/DEPLOY.md) (Docker, `.env`, GitHub runner).

After setup, every `git push origin main` deploys automatically — no manual SSH.

**Production ports:** web **3003**, API **8010** by default — set via `WEB_HOST_PORT` / `API_HOST_PORT` in server `.env` ([`.env.production.example`](./.env.production.example)).

The browser uses same-origin `/api` and Socket.IO requests; Next.js proxies them
to the API service. No LAN IP is compiled into the web bundle. With a central
Windows API and project sites connected over VPN, leave `API_PUBLIC_URL` blank:
FaceURL/webhook addresses choose the OS route to each panel. Set it only when a
reverse proxy/NAT exposes one stable URL reachable by every site.

## URLs

| Service | Local dev | Production (VM) |
|---------|-----------|-----------------|
| Web UI | http://localhost:3003 | http://\<VM-IP\>:3003 |
| API | http://localhost:8010/api | http://\<VM-IP\>:8010/api |
| Swagger | http://localhost:8010/api/docs | http://\<VM-IP\>:8010/api/docs |
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
| `API_PUBLIC_URL` | Optional common URL for face sync + webhook; blank enables per-panel LAN/VPN route selection |
| `AKUVOX_MOCK_MODE` | Set `false` when syncing to a real panel |
| Windows Firewall | Allow inbound TCP **8010** (or the configured `API_PORT`) from the panel subnet |

Optional inbound security (`.env`):

```
AKUVOX_WEBHOOK_TOKEN=your-secret
AKUVOX_ALLOWED_IPS=192.168.71.186
```

**Smoke test** (mock panel IP when testing from localhost):

```bash
curl -X POST http://localhost:8010/api/akuvox/door_log \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 192.168.71.186" \
  -d '{"Type":"Face","Status":"Success","UserID":"NV-0003","Date":"2026-07-20","Time":"16:30:00"}'
```

After a scan or curl test, `GET /api/health` should show `realtime.lastWebhookAt` updating. Admin → **Devices** shows the webhook URL and a **Test webhook** button.

Face enroll auto-syncs credentials to Akuvox panels when `AKUVOX_MOCK_MODE=false`.

## Test Webhook Flow (legacy)

Legacy Action URL / colon-pairs endpoint (kept for compatibility):

```bash
curl -X POST http://localhost:8010/api/webhooks/akuvox \
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

## Simulator Akuvox + camera (Windows)

Khi không có thiết bị thật, dùng script này để tạo camera và đầu đọc giả lập
trong DB, gắn camera IP ảo `192.168.1.4` vào Akuvox, rồi gửi sự kiện chấm công
bằng nút bấm (không cần nhập mã nhân sự):

```powershell
# Terminal 1: bật API với redirect nguồn camera ảo (go2rtc native)
$env:MOCK_CAMERA_ENABLED='true'
$env:MOCK_CAMERA_IP='192.168.1.4'
$env:MOCK_CAMERA_SOURCE='rtsp://192.168.1.4:554/rtsp/streaming?channel=1&subtype=0'
$env:MOCK_CAMERA_USERNAME='admin'
$env:MOCK_CAMERA_PASSWORD='<mat-khau-RTSP-cua-camera>'
pnpm dev:api

# Terminal 2: tạo dữ liệu + mở cửa sổ nút bấm gửi chấm công
.\tools\simulate-akuvox.ps1
```

Database PostgreSQL và API phải đang chạy trước khi mở simulator. Có thể mở
`Akuvox Simulator.lnk` trên Desktop; shortcut chạy ẩn console và chỉ hiện lỗi
ngắn gọn nếu database chưa sẵn sàng.

Simulator mặc định dùng chính RTSP profile của camera giám sát. Nếu không có
RTSP thật, bỏ `MOCK_CAMERA_SOURCE` (hoặc dùng `http://127.0.0.1:19084/stream.mjpeg`)
để chạy bộ phát hình sinh tự động. Khi go2rtc chạy trong Docker Desktop, API
native Windows vẫn truy cập RTSP thật qua địa chỉ LAN như trên.
Simulator chỉ chuyển hướng runtime cho đúng IP ảo khi `MOCK_CAMERA_ENABLED=true`; dữ liệu camera vẫn giữ RTSP/ONVIF metadata `192.168.1.4` để kiểm thử luồng giống camera thật.
Script setup ghi sẵn profile ONVIF và mapping vào DB (không giả quảng bá WS-Discovery trên mạng), vì `192.168.1.4` không phải địa chỉ thật của máy đang chạy.
Setup tự tạo nhân sự `SIM-NV-14` và ca giả lập 08:00–17:00. Cửa sổ simulator có nút **Gửi chấm công** và **Gửi từ chối**, không cần nhập mã nhân sự. Có thể dùng `-Action interactive` nếu muốn chạy dạng dòng lệnh.

## Architecture

See [docs.md](./docs.md) for full system architecture, data flows, and module specifications.

## Roadmap

- [x] Full CRUD UI for admin pages
- [x] Akuvox REST API 2-way sync
- [x] Shift calculation logic (late/early/OT)
- [x] Excel report export
- [x] Production Docker Compose (API + Web containers)
