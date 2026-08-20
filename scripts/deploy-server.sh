#!/usr/bin/env bash
# Run on the Linux server after cloning the repo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Install Docker Engine + Compose plugin first."
  exit 1
fi

if [ ! -f .env ]; then
  if [ -f .env.production.example ]; then
    cp .env.production.example .env
    echo "Created .env from .env.production.example — edit IPs/secrets before continuing."
    exit 1
  fi
  echo "Missing .env — copy .env.production.example to .env and configure."
  exit 1
fi

# shellcheck disable=SC1091
set -a
# Export only simple KEY=VALUE lines for compose variable substitution
WEB_HOST_PORT="$(grep -E '^WEB_HOST_PORT=' .env | cut -d= -f2- | tr -d ' "\r' || true)"
API_HOST_PORT="$(grep -E '^API_HOST_PORT=' .env | cut -d= -f2- | tr -d ' "\r' || true)"
POSTGRES_USER="$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2- | tr -d ' "\r' || true)"
POSTGRES_DB="$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2- | tr -d ' "\r' || true)"
WEB_HOST_PORT="${WEB_HOST_PORT:-3003}"
API_HOST_PORT="${API_HOST_PORT:-8010}"
POSTGRES_USER="${POSTGRES_USER:-acv2}"
POSTGRES_DB="${POSTGRES_DB:-access_control_v2}"
set +a

echo "==> Building and starting infra (postgres/redis/minio)..."
docker compose -f docker-compose.prod.yml up -d --build postgres redis minio

echo "==> Waiting for postgres healthy..."
for i in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec -T postgres \
    pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> Running database migrations (one-off container)..."
set +e
MIGRATE_LOG="$(docker compose -f docker-compose.prod.yml run --rm --no-deps api npx prisma migrate deploy 2>&1)"
MIGRATE_EC=$?
set -e
echo "$MIGRATE_LOG"
if [ "$MIGRATE_EC" -ne 0 ]; then
  if echo "$MIGRATE_LOG" | grep -qE 'P3015|not found in the migrations directory|missing from the local'; then
    echo "==> Squashed migrations: reset Prisma history and mark baseline applied (schema already exists)."
    docker compose -f docker-compose.prod.yml exec -T postgres \
      psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'DELETE FROM "_prisma_migrations";'
    docker compose -f docker-compose.prod.yml run --rm --no-deps api \
      npx prisma migrate resolve --applied 20260811120000_init
    echo "==> Applying remaining migrations after baseline..."
    docker compose -f docker-compose.prod.yml run --rm --no-deps api npx prisma migrate deploy
  else
    exit "$MIGRATE_EC"
  fi
fi

echo "==> Seeding roles + default admin..."
if ! docker compose -f docker-compose.prod.yml run --rm --no-deps api npx prisma db seed; then
  echo "WARN: seed failed. Check logs above."
  exit 1
fi

if [ "${SEED_DB:-false}" = "true" ]; then
  echo "==> Seeding demo contractor data..."
  if ! docker compose -f docker-compose.prod.yml run --rm --no-deps api node prisma/seed-contractor-demo.js; then
    echo "WARN: demo seed failed (often OK if data already exists). Check logs above."
  fi
fi

echo "==> Starting API + Web..."
docker compose -f docker-compose.prod.yml up -d --build api web

echo "==> Waiting for API to stay up..."
for i in $(seq 1 40); do
  status="$(docker inspect -f '{{.State.Status}}' acv2-api 2>/dev/null || echo missing)"
  if [ "$status" = "running" ]; then
    if curl -fsS "http://127.0.0.1:${API_HOST_PORT}/api/health" >/dev/null 2>&1; then
      echo "API is healthy."
      break
    fi
  fi
  if [ "$status" = "restarting" ] || [ "$status" = "exited" ]; then
    echo "API container status=$status — recent logs:"
    docker compose -f docker-compose.prod.yml logs --tail=80 api || true
    exit 1
  fi
  sleep 2
done

echo ""
echo "Done."
echo "  Web:     http://$(hostname -I | awk '{print $1}'):${WEB_HOST_PORT}"
echo "  API:     http://$(hostname -I | awk '{print $1}'):${API_HOST_PORT}/api"
echo "  Swagger: http://$(hostname -I | awk '{print $1}'):${API_HOST_PORT}/api/docs"
echo "  Login:   admin / admin123 (change after first login if seeded)"
