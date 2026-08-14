-- AlterTable
ALTER TABLE "access_logs" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "access_logs_projectId_idx" ON "access_logs"("projectId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_project_transfers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromProjectId" TEXT,
    "toProjectId" TEXT NOT NULL,
    "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byAccountId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_project_transfers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_project_transfers_userId_idx" ON "user_project_transfers"("userId");
CREATE INDEX IF NOT EXISTS "user_project_transfers_toProjectId_idx" ON "user_project_transfers"("toProjectId");
CREATE INDEX IF NOT EXISTS "user_project_transfers_transferredAt_idx" ON "user_project_transfers"("transferredAt");

DO $$ BEGIN
  ALTER TABLE "user_project_transfers" ADD CONSTRAINT "user_project_transfers_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_project_transfers" ADD CONSTRAINT "user_project_transfers_fromProjectId_fkey"
    FOREIGN KEY ("fromProjectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_project_transfers" ADD CONSTRAINT "user_project_transfers_toProjectId_fkey"
    FOREIGN KEY ("toProjectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_project_transfers" ADD CONSTRAINT "user_project_transfers_byAccountId_fkey"
    FOREIGN KEY ("byAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
