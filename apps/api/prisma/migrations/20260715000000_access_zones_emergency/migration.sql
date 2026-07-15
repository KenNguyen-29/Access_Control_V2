-- AlterEnum
ALTER TYPE "AccessAction" ADD VALUE IF NOT EXISTS 'FIRE_EMERGENCY';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PresenceStatus" AS ENUM ('CHECK_IN', 'INSIDE', 'CHECK_OUT', 'OUTSIDE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EmergencySafeStatus" AS ENUM ('INSIDE', 'SAFE', 'MISSING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "access_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentZoneId" TEXT,
    "description" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_zones_pkey" PRIMARY KEY ("id")
);

-- AlterTable devices
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "zoneId" TEXT;

-- AlterTable access_logs: make deviceId nullable, add zoneId
ALTER TABLE "access_logs" ALTER COLUMN "deviceId" DROP NOT NULL;
ALTER TABLE "access_logs" ADD COLUMN IF NOT EXISTS "zoneId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_access_permissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_access_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_presence" (
    "userId" TEXT NOT NULL,
    "currentStatus" "PresenceStatus",
    "currentZoneId" TEXT,
    "lastEventTime" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_presence_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE IF NOT EXISTS "emergency_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT 'FIRE_EMERGENCY',
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "emergency_muster" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "safeStatus" "EmergencySafeStatus" NOT NULL DEFAULT 'INSIDE',
    "markedById" TEXT,
    "markedTime" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_muster_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "user_access_permissions_userId_zoneId_key" ON "user_access_permissions"("userId", "zoneId");
CREATE INDEX IF NOT EXISTS "user_access_permissions_userId_idx" ON "user_access_permissions"("userId");
CREATE INDEX IF NOT EXISTS "user_access_permissions_zoneId_idx" ON "user_access_permissions"("zoneId");
CREATE INDEX IF NOT EXISTS "user_presence_currentStatus_idx" ON "user_presence"("currentStatus");
CREATE INDEX IF NOT EXISTS "emergency_muster_eventId_idx" ON "emergency_muster"("eventId");

-- ForeignKeys (best-effort; ignore if already exist)
DO $$ BEGIN
  ALTER TABLE "access_zones" ADD CONSTRAINT "access_zones_parentZoneId_fkey" FOREIGN KEY ("parentZoneId") REFERENCES "access_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "devices" ADD CONSTRAINT "devices_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "access_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "access_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_access_permissions" ADD CONSTRAINT "user_access_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_access_permissions" ADD CONSTRAINT "user_access_permissions_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "access_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_presence" ADD CONSTRAINT "user_presence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_presence" ADD CONSTRAINT "user_presence_currentZoneId_fkey" FOREIGN KEY ("currentZoneId") REFERENCES "access_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "emergency_events" ADD CONSTRAINT "emergency_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "emergency_muster" ADD CONSTRAINT "emergency_muster_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "emergency_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "emergency_muster" ADD CONSTRAINT "emergency_muster_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "emergency_muster" ADD CONSTRAINT "emergency_muster_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
