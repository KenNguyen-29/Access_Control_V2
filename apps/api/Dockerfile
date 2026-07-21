# ── API (NestJS) ──────────────────────────────────────────
FROM node:20-alpine AS api-deps
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @acv2/api...

FROM node:20-alpine AS api-build
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY --from=api-deps /app/node_modules ./node_modules
COPY --from=api-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=api-deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @acv2/shared build \
  && pnpm --filter @acv2/api exec prisma generate \
  && pnpm --filter @acv2/api build

FROM node:20-alpine AS api
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
ENV NODE_ENV=production
COPY --from=api-build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/apps/api/package.json ./apps/api/
COPY --from=api-build /app/apps/api/dist ./apps/api/dist
COPY --from=api-build /app/apps/api/prisma ./apps/api/prisma
COPY --from=api-build /app/apps/api/tsconfig.seed.json ./apps/api/tsconfig.seed.json
COPY --from=api-build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=api-build /app/packages/shared ./packages/shared
WORKDIR /app/apps/api
EXPOSE 8080
CMD ["node", "dist/main.js"]
