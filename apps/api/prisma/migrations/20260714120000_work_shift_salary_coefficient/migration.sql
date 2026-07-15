-- Add salary coefficient to work shifts for payroll multiplier
ALTER TABLE "work_shifts" ADD COLUMN "salaryCoefficient" DOUBLE PRECISION NOT NULL DEFAULT 1;
