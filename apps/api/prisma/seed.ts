import { PrismaClient, UserRole, DeviceType, CredentialType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const roles = [
    { name: 'Administrator', code: UserRole.ADMIN, description: 'Full system access' },
    { name: 'HR Manager', code: UserRole.HR, description: 'HR and attendance management' },
    { name: 'Security Guard', code: UserRole.SECURITY, description: 'Live monitoring dashboard' },
    { name: 'Technician', code: UserRole.TECHNICIAN, description: 'Device maintenance' },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {},
      create: role,
    });
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: UserRole.ADMIN } });

  const passwordHash = await bcrypt.hash('admin123', 10);
  await prisma.account.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash,
      roleId: adminRole.id,
    },
  });

  const dept = await prisma.department.upsert({
    where: { code: 'IT' },
    update: {},
    create: {
      name: 'Information Technology',
      code: 'IT',
      description: 'IT Department',
    },
  });

  const user = await prisma.user.upsert({
    where: { employeeCode: 'EMP001' },
    update: {},
    create: {
      employeeCode: 'EMP001',
      fullName: 'Nguyen Van A',
      email: 'nguyenvana@example.com',
      departmentId: dept.id,
    },
  });

  await prisma.credential.upsert({
    where: { id: 'seed-credential-001' },
    update: {},
    create: {
      id: 'seed-credential-001',
      userId: user.id,
      type: CredentialType.FACE,
      externalId: 'EMP001',
    },
  });

  const dayShift = await prisma.workShift.upsert({
    where: { code: 'DAY' },
    update: { gracePeriodMinutes: 5 },
    create: {
      name: 'Ca Hành Chính',
      code: 'DAY',
      startTime: '08:00',
      endTime: '17:00',
      breakMinutes: 60,
      gracePeriodMinutes: 5,
      isDefault: true,
    },
  });

  await prisma.workShift.upsert({
    where: { code: 'NIGHT' },
    update: { gracePeriodMinutes: 5 },
    create: {
      name: 'Ca Đêm',
      code: 'NIGHT',
      startTime: '22:00',
      endTime: '06:00',
      isOvernight: true,
      gracePeriodMinutes: 5,
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'default_work_shift_id' },
    update: { value: dayShift.id },
    create: { key: 'default_work_shift_id', value: dayShift.id },
  });

  const settingsSeed: Array<{ key: string; value: string }> = [
    { key: 'EMERGENCY_MODE', value: 'FALSE' },
    { key: 'ACCESS_ZONE_SCHEDULES_JSON', value: JSON.stringify({ schedules: {} }) },
    { key: 'DATE_FORMAT', value: 'DD/MM/YYYY' },
    { key: 'AUTO_LOGOUT_ENABLED', value: 'false' },
    { key: 'LOG_RETENTION_DAYS', value: '90' },
    { key: 'STORAGE_RETENTION_DAYS', value: '30' },
  ];
  for (const s of settingsSeed) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }

  const mainZone = await prisma.accessZone.upsert({
    where: { id: 'seed-zone-main' },
    update: {},
    create: {
      id: 'seed-zone-main',
      name: 'Khu vực chính',
      description: 'Cổng chính & sảnh',
    },
  });

  const officeZone = await prisma.accessZone.upsert({
    where: { id: 'seed-zone-office' },
    update: {},
    create: {
      id: 'seed-zone-office',
      name: 'Khu văn phòng',
      description: 'Tầng văn phòng',
    },
  });

  await prisma.userAccessPermission.upsert({
    where: { userId_zoneId: { userId: user.id, zoneId: mainZone.id } },
    update: {},
    create: { userId: user.id, zoneId: mainZone.id },
  });

  const akuvox = await prisma.device.upsert({
    where: { code: 'AKUVOX-MAIN' },
    update: { zoneId: mainZone.id },
    create: {
      name: 'Cổng Chính - Akuvox',
      code: 'AKUVOX-MAIN',
      deviceType: DeviceType.AKUVOX,
      ipAddress: '192.168.1.100',
      location: 'Cổng chính',
      zoneId: mainZone.id,
      isOnline: true,
    },
  });

  const camera = await prisma.device.upsert({
    where: { code: 'CAM-MAIN' },
    update: {},
    create: {
      name: 'Camera Cổng Chính',
      code: 'CAM-MAIN',
      deviceType: DeviceType.CAMERA,
      ipAddress: '192.168.1.101',
      location: 'Cổng chính',
      rtspUrl: 'rtsp://192.168.1.101:554/stream1',
      isOnline: true,
    },
  });

  await prisma.deviceCameraMapping.upsert({
    where: {
      akuvoxDeviceId_cameraDeviceId: {
        akuvoxDeviceId: akuvox.id,
        cameraDeviceId: camera.id,
      },
    },
    update: {},
    create: {
      akuvoxDeviceId: akuvox.id,
      cameraDeviceId: camera.id,
      priority: 0,
    },
  });

  console.log('Seed completed.');
  console.log('  Admin login: admin / admin123');
  console.log('  Demo employee: EMP001 - Nguyen Van A');
  console.log(`  Sample zones: ${mainZone.name}, ${officeZone.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
