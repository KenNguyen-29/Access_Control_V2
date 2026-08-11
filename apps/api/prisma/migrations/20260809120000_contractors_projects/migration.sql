-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "citizenId" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "contractorId" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "users_citizenId_key" ON "users"("citizenId");
CREATE INDEX IF NOT EXISTS "users_contractorId_idx" ON "users"("contractorId");
CREATE INDEX IF NOT EXISTS "users_projectId_idx" ON "users"("projectId");

-- CreateTable
CREATE TABLE IF NOT EXISTS "contractors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "contractors_code_key" ON "contractors"("code");

CREATE TABLE IF NOT EXISTS "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "siteName" TEXT,
    "description" TEXT,
    "contractorId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "projects_code_key" ON "projects"("code");
CREATE INDEX IF NOT EXISTS "projects_contractorId_idx" ON "projects"("contractorId");

CREATE TABLE IF NOT EXISTS "daily_contractor_headcounts" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "contractorId" TEXT NOT NULL,
    "projectId" TEXT,
    "headcount" INTEGER NOT NULL,
    "payload" JSONB,
    "pushedAt" TIMESTAMP(3),
    "pushStatus" TEXT,
    "pushError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_contractor_headcounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_contractor_headcounts_date_contractorId_key"
  ON "daily_contractor_headcounts"("date", "contractorId");
CREATE INDEX IF NOT EXISTS "daily_contractor_headcounts_date_idx" ON "daily_contractor_headcounts"("date");

DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_contractorId_fkey"
    FOREIGN KEY ("contractorId") REFERENCES "contractors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_contractorId_fkey"
    FOREIGN KEY ("contractorId") REFERENCES "contractors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "daily_contractor_headcounts" ADD CONSTRAINT "daily_contractor_headcounts_contractorId_fkey"
    FOREIGN KEY ("contractorId") REFERENCES "contractors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "daily_contractor_headcounts" ADD CONSTRAINT "daily_contractor_headcounts_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
