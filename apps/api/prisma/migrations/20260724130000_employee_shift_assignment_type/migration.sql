-- AlterTable
CREATE TYPE "EmployeeShiftAssignType" AS ENUM ('FIXED', 'RANGED');

ALTER TABLE "employee_shifts"
ADD COLUMN "assignmentType" "EmployeeShiftAssignType" NOT NULL DEFAULT 'RANGED';

-- Existing open-ended assignments are treated as FIXED
UPDATE "employee_shifts"
SET "assignmentType" = 'FIXED'
WHERE "endDate" IS NULL AND "isDeleted" = false;
