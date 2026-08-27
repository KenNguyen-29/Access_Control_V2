# Deploy tự động (CI/CD)

Push lên `main` → **CI** (GitHub cloud) chạy test/build → **Deploy** chạy trên **self-hosted runner** trên máy chủ đích.

> Máy LAN (`192.168.x.x`) không nhận SSH từ GitHub cloud. Cần **runner cài trên chính máy chủ** (hoặc máy cùng mạng LAN).

---

## Luồng

```text
git push main
  → CI (ubuntu-latest): typecheck + build + docker build
  → Deploy (self-hosted): checkout → copy .env → docker compose up → migrate → health check
```

DB chỉ 2 bước:

1. `prisma/migrations/20260811120000_init` — tạo đủ bảng
2. `prisma/seed.ts` — 5 vai trò + account `admin` / `admin123`

Server đã có data: deploy đánh dấu baseline đã apply rồi chạy seed (không đè mật khẩu admin cũ).

---

## Thiết lập một lần trên máy chủ

### 1. Docker + git

```bash
ssh <SERVER_USER>@<SERVER_HOST>

sudo apt update && sudo apt install -y git curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# logout SSH, login lại
```

### 2. File `.env` cố định (không commit Git)

```bash
mkdir -p ~/Access_Control_V2
nano ~/Access_Control_V2/.env
```

Dán nội dung từ [`.env.production.example`](../.env.production.example) và thay các secret cần thiết.

Mặc định port công ty: **web 3003**, **API 8010** (`WEB_HOST_PORT`, `API_HOST_PORT`).
Web build mặc định gọi same-origin và proxy `/api`, `/socket.io` tới
`API_PROXY_TARGET=http://api:8080`; không cần điền IP máy chủ vào
`NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL`.

Deploy lần đầu tự tạo **roles** + tài khoản **admin / admin123** (đổi mật khẩu sau khi vào). Demo nhà thầu (tùy chọn):

```bash
git clone https://github.com/<ORG>/Access_Control_V2.git /tmp/acv2-setup
cd /tmp/acv2-setup
cp ~/Access_Control_V2/.env .env
chmod +x scripts/deploy-server.sh
SEED_DB=true ./scripts/deploy-server.sh
```

### 3. Cài GitHub Actions self-hosted runner

Trên GitHub: **Settings → Actions → Runners → New self-hosted runner → Linux**

Trên máy chủ:

```bash
cd ~
git clone https://github.com/<ORG>/Access_Control_V2.git acv2-runner-setup
cd acv2-runner-setup
chmod +x scripts/setup-github-runner.sh

export GITHUB_REPOSITORY=<ORG>/Access_Control_V2
export RUNNER_TOKEN=<token-từ-github>
./scripts/setup-github-runner.sh

cd ~/actions-runner
sudo ./svc.sh install admintechfarm
sudo ./svc.sh start
sudo ./svc.sh status
```

Runner phải hiện **Idle** (xanh) trong GitHub → Actions → Runners.

### 4. Environment `production` (khuyến nghị)

GitHub → **Settings → Environments → New environment** → tên `production`

Có thể bật **Required reviewers** nếu muốn duyệt trước khi deploy.

---

## Sau khi setup

Mỗi lần `git push origin main`:

1. Tab **Actions** → workflow **CI** chạy xong
2. Workflow **Deploy** tự chạy trên runner máy chủ
3. Truy cập `http://<SERVER_HOST>:3003` (web), API `http://<SERVER_HOST>:8010/api` (đổi port qua `WEB_HOST_PORT` / `API_HOST_PORT` trong `.env`). Web dùng same-origin proxy nên không cần nhúng IP vào bản build.

Không cần SSH thủ công để `git pull` nữa.

---

## Biến môi trường runner (tùy chọn)

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `ACV2_ENV_FILE` | `/home/admintechfarm/Access_Control_V2/.env` | Đường dẫn `.env` trên server |

Thêm vào `~/actions-runner/.env` hoặc systemd service nếu đổi path.

---

## Firewall

Mở TCP **3003** (web), **8010** (API) cho LAN — hoặc đúng `WEB_HOST_PORT` / `API_HOST_PORT` trong `.env`.

---

## Xử lý lỗi

| Lỗi | Cách xử lý |
|-----|------------|
| Deploy không chạy | Runner offline? `sudo ./svc.sh status` trong `~/actions-runner` |
| Missing `.env` | Tạo `~/Access_Control_V2/.env` như bước 2 |
| CI pass, Deploy skip | Chỉ deploy khi push **main** và CI **success** |
| Health check fail | `docker compose -f docker-compose.prod.yml logs api` trên server |
| Ảnh FaceID hoặc callback không tới được | Để trống `API_PUBLIC_URL` để API chọn source address theo route Windows tới từng panel (LAN/VPN); nếu có reverse proxy/NAT chung, đặt URL public của proxy và kiểm tra firewall/route. |
| Ảnh mất sau rebuild | Volume `face_uploads` giữ `/app/uploads`. Upload lại ảnh nếu volume mới tạo lần đầu. |

---

## Akuvox

Trong `~/Access_Control_V2/.env`:

```env
AKUVOX_MOCK_MODE=false
# Optional: leave empty for automatic per-device LAN/VPN route selection;
# set the reverse-proxy URL only when every panel can reach that common URL.
API_PUBLIC_URL=
```

Action URL / door_log: dùng URL trả về tại **Thiết bị → webhook-info**; với
VPN nhiều site, thêm `?deviceIp=<IP_PANEL>` để lấy URL theo đúng route.
