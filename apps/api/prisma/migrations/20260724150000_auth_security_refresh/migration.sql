-- AlterTable
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "mfaSecret" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "mfaBackupCodes" TEXT;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);

-- Force change for known default admin password users (must change on next login)
UPDATE "accounts"
SET "mustChangePassword" = true
WHERE "username" = 'admin' AND "isDeleted" = false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "refresh_tokens_accountId_idx" ON "refresh_tokens"("accountId");

DO $$ BEGIN
  ALTER TABLE "refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Date range integrity for employee shift assignments
DO $$ BEGIN
  ALTER TABLE "employee_shifts"
    ADD CONSTRAINT "employee_shifts_end_on_or_after_start"
    CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
