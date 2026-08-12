-- AlterEnum
ALTER TYPE "DeviceType" ADD VALUE IF NOT EXISTS 'DNAKE';

-- AlterTable
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "dnakeConfig" JSONB;
