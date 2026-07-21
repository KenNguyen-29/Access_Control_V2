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

echo "==> Building and starting containers..."
docker compose -f docker-compose.prod.yml up -d --build

echo "==> Waiting for API..."
sleep 8

echo "==> Running database migrations..."
docker compose -f docker-compose.prod.yml exec -T api npx prisma migrate deploy

if [ "${SEED_DB:-false}" = "true" ]; then
  echo "==> Seeding database..."
  docker compose -f docker-compose.prod.yml exec -T api npx prisma db seed
fi

echo ""
echo "Done."
echo "  Web:     http://$(hostname -I | awk '{print $1}'):3000"
echo "  API:     http://$(hostname -I | awk '{print $1}'):8080/api"
echo "  Swagger: http://$(hostname -I | awk '{print $1}'):8080/api/docs"
echo "  Login:   admin / admin123 (change after first login if seeded)"
