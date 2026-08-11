-- Idempotent: tạo 5 vai trò đăng nhập nếu chưa có (không đụng account/user).
INSERT INTO "roles" ("id", "name", "code", "description", "isDeleted", "createdAt", "updatedAt")
VALUES
  ('role_admin', 'Administrator', 'ADMIN', 'Full system access', false, NOW(), NOW()),
  ('role_hr', 'HR Manager', 'HR', 'HR and attendance management', false, NOW(), NOW()),
  ('role_security', 'Security Guard', 'SECURITY', 'Live monitoring dashboard', false, NOW(), NOW()),
  ('role_technician', 'Technician', 'TECHNICIAN', 'Device maintenance', false, NOW(), NOW()),
  ('role_staff', 'Nhân viên vận hành', 'STAFF', 'Site operations — scoped by project', false, NOW(), NOW())
ON CONFLICT ("code") DO UPDATE
SET
  "isDeleted" = false,
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "updatedAt" = NOW();
