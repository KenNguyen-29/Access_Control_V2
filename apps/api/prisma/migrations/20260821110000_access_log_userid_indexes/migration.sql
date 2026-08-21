-- Speed up contractor headcount / presence lookups by user + day.
CREATE INDEX IF NOT EXISTS "access_logs_userId_idx" ON "access_logs"("userId");
CREATE INDEX IF NOT EXISTS "access_logs_eventAt_isValid_idx" ON "access_logs"("eventAt", "isValid");
