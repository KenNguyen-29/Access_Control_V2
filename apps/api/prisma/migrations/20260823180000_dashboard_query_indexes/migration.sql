-- Dashboard / reports: composite indexes for date-range + filter queries.

CREATE INDEX IF NOT EXISTS "access_logs_eventAt_action_idx" ON "access_logs"("eventAt", "action");
CREATE INDEX IF NOT EXISTS "access_logs_zoneId_eventAt_idx" ON "access_logs"("zoneId", "eventAt");
CREATE INDEX IF NOT EXISTS "access_logs_projectId_eventAt_idx" ON "access_logs"("projectId", "eventAt");
CREATE INDEX IF NOT EXISTS "user_presence_currentZoneId_idx" ON "user_presence"("currentZoneId");
CREATE INDEX IF NOT EXISTS "devices_zoneId_isDeleted_idx" ON "devices"("zoneId", "isDeleted");
CREATE INDEX IF NOT EXISTS "attendance_records_date_idx" ON "attendance_records"("date");
