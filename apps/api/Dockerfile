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

RUN cp -R /app/apps/api/dist /app/deploy/dist \
  && cp -R /app/apps/api/prisma /app/deploy/prisma \
  && (cp /app/apps/api/tsconfig.seed.json /app/deploy/tsconfig.seed.json || true) \
  && cd /app/deploy \
  && pnpm exec prisma generate --schema=./prisma/schema.prisma || npx --yes prisma@6.19.3 generate --schema=./prisma/schema.prisma

FROM node:20-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=api-build /app/deploy ./
# prisma CLI + ts-node for migrate/seed (not included in --prod deploy)
RUN npm install -g prisma@6.19.3 ts-node typescript \
  && node -e "require('express'); require('@prisma/client'); console.log('deps ok')"
EXPOSE 8080
CMD ["node", "dist/main.js"]
