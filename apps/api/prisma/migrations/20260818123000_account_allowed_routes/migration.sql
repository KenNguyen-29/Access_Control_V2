-- Per-account configurable web route access
ALTER TABLE "accounts" ADD COLUMN "allowedRoutes" JSONB;
