-- CreateTable
CREATE TABLE IF NOT EXISTS "project_contractors" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_contractors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_contractors_projectId_contractorId_key"
  ON "project_contractors"("projectId", "contractorId");
CREATE INDEX IF NOT EXISTS "project_contractors_contractorId_idx"
  ON "project_contractors"("contractorId");

DO $$ BEGIN
  ALTER TABLE "project_contractors" ADD CONSTRAINT "project_contractors_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "project_contractors" ADD CONSTRAINT "project_contractors_contractorId_fkey"
    FOREIGN KEY ("contractorId") REFERENCES "contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Migrate existing Project.contractorId → join rows
INSERT INTO "project_contractors" ("id", "projectId", "contractorId", "createdAt")
SELECT
  'pc_' || p."id" || '_' || p."contractorId",
  p."id",
  p."contractorId",
  CURRENT_TIMESTAMP
FROM "projects" p
WHERE p."contractorId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "project_contractors" pc
    WHERE pc."projectId" = p."id" AND pc."contractorId" = p."contractorId"
  );

-- Drop old FK + column
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_contractorId_fkey";
DROP INDEX IF EXISTS "projects_contractorId_idx";
ALTER TABLE "projects" DROP COLUMN IF EXISTS "contractorId";
