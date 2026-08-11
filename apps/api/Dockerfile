# ── API (NestJS) ──────────────────────────────────────────
FROM node:20-alpine AS api-deps
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @acv2/api...

FROM node:20-alpine AS api-build
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY --from=api-deps /app/node_modules ./node_modules
COPY --from=api-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=api-deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @acv2/shared build \
  && pnpm --filter @acv2/api exec prisma generate \
  && pnpm --filter @acv2/api build \
  && pnpm --filter @acv2/api --prod deploy /app/deploy

# Bundle dist + prisma; compile seed.ts → seed.js so production seed needs no ts-node
RUN cp -R /app/apps/api/dist /app/deploy/dist \
  && cp -R /app/apps/api/prisma /app/deploy/prisma \
  && cp /app/apps/api/package.json /app/deploy/package.json \
  && cd /app/apps/api \
  && pnpm exec tsc -p tsconfig.seed.json --outDir /tmp/seed-out --rootDir prisma \
  && cp /tmp/seed-out/*.js /app/deploy/prisma/ \
  && cd /app/deploy \
  && (pnpm exec prisma generate --schema=./prisma/schema.prisma || npx --yes prisma@6.19.3 generate --schema=./prisma/schema.prisma)

FROM node:20-alpine AS api
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production
COPY --from=api-build /app/deploy ./
RUN mkdir -p /app/uploads/face-images \
  && npm install -g prisma@6.19.3 \
  && node -e "require('express'); require('@prisma/client'); require('sharp'); console.log('deps ok')" \
  && test -f prisma/seed.js && test -f prisma/ensure-bootstrap.js && test -f prisma/run-seed.cjs
EXPOSE 8080
CMD ["node", "dist/main.js"]
