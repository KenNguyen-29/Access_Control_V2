-- Persist the ONVIF source/profile selected in the camera setup flow.
CREATE TYPE "CameraConnectionSource" AS ENUM ('ONVIF', 'MANUAL');

ALTER TABLE "devices"
  ADD COLUMN "connectionSource" "CameraConnectionSource",
  ADD COLUMN "onvifServiceUrl" TEXT,
  ADD COLUMN "onvifProfileToken" TEXT,
  ADD COLUMN "onvifPort" INTEGER,
  ADD COLUMN "manufacturer" TEXT,
  ADD COLUMN "model" TEXT,
  ADD COLUMN "lastConnectionError" TEXT;

UPDATE "devices"
SET "connectionSource" = 'MANUAL'
WHERE "deviceType" = 'CAMERA' AND "connectionSource" IS NULL;
