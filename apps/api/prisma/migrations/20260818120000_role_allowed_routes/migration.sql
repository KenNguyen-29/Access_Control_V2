-- Per-role configurable web route access
ALTER TABLE "roles" ADD COLUMN "allowedRoutes" JSONB;
