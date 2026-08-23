-- Comprehensive query indexes across all modules (reports, users, shifts, devices, auth…).

-- access_logs (supplement dashboard migration)
CREATE INDEX IF NOT EXISTS "access_logs_deviceId_eventAt_idx" ON "access_logs"("deviceId", "eventAt");
CREATE INDEX IF NOT EXISTS "access_logs_userId_eventAt_idx" ON "access_logs"("userId", "eventAt");

-- users
CREATE INDEX IF NOT EXISTS "users_departmentId_isDeleted_idx" ON "users"("departmentId", "isDeleted");
CREATE INDEX IF NOT EXISTS "users_contractorId_isDeleted_idx" ON "users"("contractorId", "isDeleted");
CREATE INDEX IF NOT EXISTS "users_projectId_isDeleted_idx" ON "users"("projectId", "isDeleted");
CREATE INDEX IF NOT EXISTS "users_isDeleted_createdAt_idx" ON "users"("isDeleted", "createdAt");

-- credentials & permissions
CREATE INDEX IF NOT EXISTS "credentials_userId_isDeleted_idx" ON "credentials"("userId", "isDeleted");
CREATE INDEX IF NOT EXISTS "credentials_isDeleted_isActive_idx" ON "credentials"("isDeleted", "isActive");
CREATE INDEX IF NOT EXISTS "user_device_permissions_userId_isDeleted_idx" ON "user_device_permissions"("userId", "isDeleted");
CREATE INDEX IF NOT EXISTS "user_device_permissions_deviceId_isDeleted_idx" ON "user_device_permissions"("deviceId", "isDeleted");
CREATE INDEX IF NOT EXISTS "user_access_permissions_userId_isDeleted_idx" ON "user_access_permissions"("userId", "isDeleted");
CREATE INDEX IF NOT EXISTS "user_access_permissions_zoneId_isDeleted_idx" ON "user_access_permissions"("zoneId", "isDeleted");

-- devices & zones
CREATE INDEX IF NOT EXISTS "devices_isDeleted_deviceType_idx" ON "devices"("isDeleted", "deviceType");
CREATE INDEX IF NOT EXISTS "devices_deviceType_isDeleted_zoneId_idx" ON "devices"("deviceType", "isDeleted", "zoneId");
CREATE INDEX IF NOT EXISTS "access_zones_isDeleted_parentZoneId_idx" ON "access_zones"("isDeleted", "parentZoneId");
CREATE INDEX IF NOT EXISTS "access_zones_parentZoneId_isDeleted_idx" ON "access_zones"("parentZoneId", "isDeleted");
CREATE INDEX IF NOT EXISTS "device_camera_mappings_akuvoxDeviceId_isDeleted_idx" ON "device_camera_mappings"("akuvoxDeviceId", "isDeleted");
CREATE INDEX IF NOT EXISTS "device_camera_mappings_cameraDeviceId_isDeleted_idx" ON "device_camera_mappings"("cameraDeviceId", "isDeleted");

-- shifts & attendance
CREATE INDEX IF NOT EXISTS "employee_shifts_userId_isDeleted_idx" ON "employee_shifts"("userId", "isDeleted");
CREATE INDEX IF NOT EXISTS "employee_shifts_workShiftId_isDeleted_idx" ON "employee_shifts"("workShiftId", "isDeleted");
CREATE INDEX IF NOT EXISTS "employee_shifts_isDeleted_endDate_idx" ON "employee_shifts"("isDeleted", "endDate");
CREATE INDEX IF NOT EXISTS "employee_shifts_isDeleted_startDate_idx" ON "employee_shifts"("isDeleted", "startDate");
CREATE INDEX IF NOT EXISTS "attendance_records_date_status_idx" ON "attendance_records"("date", "status");
CREATE INDEX IF NOT EXISTS "attendance_records_date_workShiftId_idx" ON "attendance_records"("date", "workShiftId");
CREATE INDEX IF NOT EXISTS "attendance_records_workShiftId_date_idx" ON "attendance_records"("workShiftId", "date");
CREATE INDEX IF NOT EXISTS "work_shifts_isDeleted_idx" ON "work_shifts"("isDeleted");
CREATE INDEX IF NOT EXISTS "work_shifts_isDeleted_isDefault_idx" ON "work_shifts"("isDeleted", "isDefault");

-- org master lists
CREATE INDEX IF NOT EXISTS "departments_isDeleted_idx" ON "departments"("isDeleted");
CREATE INDEX IF NOT EXISTS "contractors_isDeleted_idx" ON "contractors"("isDeleted");
CREATE INDEX IF NOT EXISTS "projects_isDeleted_idx" ON "projects"("isDeleted");
CREATE INDEX IF NOT EXISTS "daily_contractor_headcounts_contractorId_date_idx" ON "daily_contractor_headcounts"("contractorId", "date");

-- auth & accounts
CREATE INDEX IF NOT EXISTS "accounts_roleId_isDeleted_idx" ON "accounts"("roleId", "isDeleted");
CREATE INDEX IF NOT EXISTS "accounts_isDeleted_isActive_idx" ON "accounts"("isDeleted", "isActive");
CREATE INDEX IF NOT EXISTS "refresh_tokens_accountId_revokedAt_idx" ON "refresh_tokens"("accountId", "revokedAt");

-- emergency & audit
CREATE INDEX IF NOT EXISTS "emergency_events_createdAt_idx" ON "emergency_events"("createdAt");
CREATE INDEX IF NOT EXISTS "emergency_events_startTime_idx" ON "emergency_events"("startTime");
CREATE INDEX IF NOT EXISTS "emergency_muster_userId_idx" ON "emergency_muster"("userId");
CREATE INDEX IF NOT EXISTS "emergency_muster_eventId_safeStatus_idx" ON "emergency_muster"("eventId", "safeStatus");
CREATE INDEX IF NOT EXISTS "audit_logs_entity_createdAt_idx" ON "audit_logs"("entity", "createdAt");
