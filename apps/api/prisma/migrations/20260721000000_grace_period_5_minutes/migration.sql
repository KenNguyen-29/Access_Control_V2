-- Late grace: on-time until startTime + 5 minutes
ALTER TABLE "work_shifts"
  ALTER COLUMN "gracePeriodMinutes" SET DEFAULT 5;

UPDATE "work_shifts"
SET "gracePeriodMinutes" = 5
WHERE "isDeleted" = false;
