-- Scale: 10k+ users — search (pg_trgm) + hot assignment / list queries.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ILIKE search on Nhân sự / Ca / Báo cáo (contains, mode insensitive).
CREATE INDEX IF NOT EXISTS "users_fullName_trgm_idx"
  ON "users" USING gin ("fullName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_employeeCode_trgm_idx"
  ON "users" USING gin ("employeeCode" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "users_citizenId_trgm_idx"
  ON "users" USING gin ("citizenId" gin_trgm_ops);

-- List active staff: isDeleted + isActive + orderBy createdAt.
CREATE INDEX IF NOT EXISTS "users_isDeleted_isActive_createdAt_idx"
  ON "users"("isDeleted", "isActive", "createdAt");

-- resolveAssignedShiftForUser / active FIXED close (per punch).
CREATE INDEX IF NOT EXISTS "employee_shifts_userId_isDeleted_startDate_idx"
  ON "employee_shifts"("userId", "isDeleted", "startDate");

-- Stats / báo cáo: date range where ca đã gán (workShiftId NOT NULL).
CREATE INDEX IF NOT EXISTS "attendance_records_date_workShift_present_idx"
  ON "attendance_records"("date", "workShiftId")
  WHERE "workShiftId" IS NOT NULL;

-- Dashboard access log counts by action in date window.
CREATE INDEX IF NOT EXISTS "access_logs_eventAt_action_isValid_idx"
  ON "access_logs"("eventAt", "action", "isValid");
