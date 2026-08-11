-- Add STAFF to UserRole enum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'STAFF';

-- CreateTable
CREATE TABLE IF NOT EXISTS "account_projects" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_projects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "account_projects_accountId_projectId_key"
  ON "account_projects"("accountId", "projectId");
CREATE INDEX IF NOT EXISTS "account_projects_projectId_idx"
  ON "account_projects"("projectId");

DO $$ BEGIN
  ALTER TABLE "account_projects" ADD CONSTRAINT "account_projects_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "account_projects" ADD CONSTRAINT "account_projects_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
