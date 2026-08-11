/**
 * Demo data: Nhà thầu / Dự án / NV / vào-ra / ca / snapshot — dễ xem UI báo cáo.
 * Chạy: pnpm --filter @acv2/api prisma:seed:contractors
 */
import { AccessAction, DeviceType, PrismaClient, UserRole, UserType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function dateOnlyUTC(base: Date) {
  return new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate()));
}

function atLocal(base: Date, hours: number, minutes: number) {
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

async function upsertContractor(code: string, name: string, description?: string) {
  return prisma.contractor.upsert({
    where: { code },
    update: { name, description, isDeleted: false },
    create: { code, name, description },
  });
}

async function upsertProject(
  code: string,
  name: string,
  contractorIds: string[],
  siteName: string,
) {
  const project = await prisma.project.upsert({
    where: { code },
    update: { name, siteName, isDeleted: false },
    create: { code, name, siteName },
  });
  await prisma.projectContractor.deleteMany({ where: { projectId: project.id } });
  if (contractorIds.length > 0) {
    await prisma.projectContractor.createMany({
      data: contractorIds.map((contractorId) => ({
        projectId: project.id,
        contractorId,
      })),
    });
  }
  return project;
}

async function upsertDemoUser(params: {
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  citizenId: string;
  userType: UserType;
  contractorId?: string;
  projectId?: string;
}) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ employeeCode: params.employeeCode }, { citizenId: params.citizenId }] },
  });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        fullName: params.fullName,
        email: params.email,
        phone: params.phone,
        citizenId: params.citizenId,
        userType: params.userType,
        contractorId: params.contractorId ?? null,
        projectId: params.projectId ?? null,
        isDeleted: false,
        isActive: true,
      },
    });
  }
  return prisma.user.create({
    data: {
      employeeCode: params.employeeCode,
      fullName: params.fullName,
      email: params.email,
      phone: params.phone,
      citizenId: params.citizenId,
      userType: params.userType,
      contractorId: params.contractorId,
      projectId: params.projectId,
    },
  });
}

async function main() {
  console.log('Seeding contractor / project demo data...');

  const hoaBinh = await upsertContractor(
    'NT-HOABINH',
    'Công ty CP Xây dựng Hòa Bình',
    'Nhà thầu chính phần thô',
  );
  const cotec = await upsertContractor(
    'NT-COTEC',
    'COTECCONS',
    'Nhà thầu thi công hoàn thiện',
  );
  const dien = await upsertContractor(
    'NT-DIEN',
    'Công ty Điện lạnh Miền Nam',
    'Nhà thầu MEP / điện',
  );

  const towerA = await upsertProject(
    'DA-TOWER-A',
    'Tòa A — Khu đô thị mẫu',
    [hoaBinh.id, dien.id],
    'Công trường Quận 7',
  );
  const towerB = await upsertProject(
    'DA-TOWER-B',
    'Tòa B — Khu đô thị mẫu',
    [cotec.id],
    'Công trường Quận 7',
  );
  const mep = await upsertProject(
    'DA-MEP-01',
    'Hạng mục MEP tầng hầm',
    [dien.id],
    'Công trường Quận 7',
  );

  const demoUsers = [
    {
      employeeCode: 'CN-HB-001',
      fullName: 'Nguyễn Văn An',
      email: 'nguyenvanan.hb@demo.local',
      phone: '0901111001',
      citizenId: '079085001001',
      userType: UserType.CONTRACTOR,
      contractorId: hoaBinh.id,
      projectId: towerA.id,
    },
    {
      employeeCode: 'CN-HB-002',
      fullName: 'Trần Thị Bình',
      email: 'tranthibinh.hb@demo.local',
      phone: '0901111002',
      citizenId: '079085001002',
      userType: UserType.CONTRACTOR,
      contractorId: hoaBinh.id,
      projectId: towerA.id,
    },
    {
      employeeCode: 'CN-HB-003',
      fullName: 'Lê Minh Cường',
      email: 'leminhcuong.hb@demo.local',
      phone: '0901111003',
      citizenId: '079085001003',
      userType: UserType.CONTRACTOR,
      contractorId: hoaBinh.id,
      projectId: towerA.id,
    },
    {
      employeeCode: 'CN-CT-001',
      fullName: 'Phạm Quốc Dũng',
      email: 'phamquocdung.ct@demo.local',
      phone: '0902222001',
      citizenId: '079085002001',
      userType: UserType.CONTRACTOR,
      contractorId: cotec.id,
      projectId: towerB.id,
    },
    {
      employeeCode: 'CN-CT-002',
      fullName: 'Hoàng Thị Em',
      email: 'hoangthiem.ct@demo.local',
      phone: '0902222002',
      citizenId: '079085002002',
      userType: UserType.CONTRACTOR,
      contractorId: cotec.id,
      projectId: towerB.id,
    },
    {
      employeeCode: 'CN-DN-001',
      fullName: 'Võ Văn Phong',
      email: 'vovanphong.dn@demo.local',
      phone: '0903333001',
      citizenId: '079085003001',
      userType: UserType.CONTRACTOR,
      contractorId: dien.id,
      projectId: mep.id,
    },
    {
      employeeCode: 'CN-DN-002',
      fullName: 'Đặng Thị Giang',
      email: 'dangthigiang.dn@demo.local',
      phone: '0903333002',
      citizenId: '079085003002',
      userType: UserType.CONTRACTOR,
      contractorId: dien.id,
      projectId: mep.id,
    },
    {
      employeeCode: 'NV-NOIBO-01',
      fullName: 'Admin Giám sát Công trường',
      email: 'giamsat.noibo@demo.local',
      phone: '0909999001',
      citizenId: '079099009001',
      userType: UserType.EMPLOYEE,
    },
  ] as const;

  const usersByCode = new Map<string, { id: string; contractorId: string | null }>();
  for (const u of demoUsers) {
    const row = await upsertDemoUser(u);
    usersByCode.set(u.employeeCode, { id: row.id, contractorId: row.contractorId });
    console.log(`  user ${u.employeeCode} — ${u.fullName}`);
  }

  // ── Ca làm + gán ca (bảng Nhân sự theo ca) ─────────────────
  console.log('Seeding shifts & assignments...');
  const dayShift = await prisma.workShift.upsert({
    where: { code: 'DAY' },
    update: {
      name: 'Ca Hành Chính',
      startTime: '08:00',
      endTime: '17:00',
      breakMinutes: 60,
      isOvernight: false,
      isDeleted: false,
    },
    create: {
      code: 'DAY',
      name: 'Ca Hành Chính',
      startTime: '08:00',
      endTime: '17:00',
      breakMinutes: 60,
      isDefault: true,
    },
  });
  const aftShift = await prisma.workShift.upsert({
    where: { code: 'AFT' },
    update: {
      name: 'Ca Chiều',
      startTime: '13:00',
      endTime: '22:00',
      breakMinutes: 45,
      isOvernight: false,
      isDeleted: false,
    },
    create: {
      code: 'AFT',
      name: 'Ca Chiều',
      startTime: '13:00',
      endTime: '22:00',
      breakMinutes: 45,
      salaryCoefficient: 1.2,
    },
  });

  const shiftAssign: Array<{ code: string; shiftId: string }> = [
    { code: 'CN-HB-001', shiftId: dayShift.id },
    { code: 'CN-HB-002', shiftId: dayShift.id },
    { code: 'CN-HB-003', shiftId: aftShift.id },
    { code: 'CN-CT-001', shiftId: dayShift.id },
    { code: 'CN-CT-002', shiftId: aftShift.id },
    { code: 'CN-DN-001', shiftId: dayShift.id },
    { code: 'CN-DN-002', shiftId: dayShift.id },
  ];
  const assignStart = dateOnlyUTC(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  for (const a of shiftAssign) {
    const user = usersByCode.get(a.code);
    if (!user) continue;
    const existing = await prisma.employeeShift.findFirst({
      where: {
        userId: user.id,
        workShiftId: a.shiftId,
        isDeleted: false,
        endDate: null,
      },
    });
    if (existing) {
      await prisma.employeeShift.update({
        where: { id: existing.id },
        data: { startDate: assignStart },
      });
    } else {
      await prisma.employeeShift.create({
        data: {
          userId: user.id,
          workShiftId: a.shiftId,
          startDate: assignStart,
          endDate: null,
          assignmentType: 'RANGED',
        },
      });
    }
    console.log(`  shift ${a.code}`);
  }

  // ── Thiết bị / khu vực + lịch sử vào-ra ────────────────────
  console.log('Seeding access logs...');
  const zone = await prisma.accessZone.upsert({
    where: { id: 'seed-zone-site' },
    update: { name: 'Cổng công trường', isDeleted: false },
    create: {
      id: 'seed-zone-site',
      name: 'Cổng công trường',
      description: 'Demo báo cáo nhà thầu',
    },
  });
  const device = await prisma.device.upsert({
    where: { code: 'AKUVOX-SITE' },
    update: { zoneId: zone.id, isDeleted: false, name: 'Cổng CT - Akuvox' },
    create: {
      name: 'Cổng CT - Akuvox',
      code: 'AKUVOX-SITE',
      deviceType: DeviceType.AKUVOX,
      ipAddress: '192.168.1.120',
      location: 'Cổng công trường',
      zoneId: zone.id,
      isOnline: true,
    },
  });

  await prisma.accessLog.deleteMany({
    where: { sourceEventId: { startsWith: 'demo-cn-' } },
  });

  const today = new Date();
  const punchDays = [0, 1, 2, 5, 7].map((back) => {
    const d = new Date(today);
    d.setDate(d.getDate() - back);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const punchUsers = [
    { code: 'CN-HB-001', inH: 7, inM: 45, outH: 17, outM: 5 },
    { code: 'CN-HB-002', inH: 8, inM: 10, outH: 17, outM: 20 },
    { code: 'CN-HB-003', inH: 12, inM: 55, outH: 22, outM: 5 },
    { code: 'CN-CT-001', inH: 7, inM: 50, outH: 16, outM: 55 },
    { code: 'CN-CT-002', inH: 13, inM: 5, outH: 21, outM: 50 },
    { code: 'CN-DN-001', inH: 8, inM: 0, outH: 17, outM: 0 },
    { code: 'CN-DN-002', inH: 8, inM: 20, outH: 17, outM: 15 },
  ];

  let logCount = 0;
  for (const day of punchDays) {
    const dayKey = `${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, '0')}${String(day.getDate()).padStart(2, '0')}`;
    for (const p of punchUsers) {
      const user = usersByCode.get(p.code);
      if (!user) continue;
      await prisma.accessLog.create({
        data: {
          userId: user.id,
          deviceId: device.id,
          zoneId: zone.id,
          action: AccessAction.CHECK_IN,
          sourceEventId: `demo-cn-${dayKey}-${p.code}-IN`,
          isValid: true,
          eventAt: atLocal(day, p.inH, p.inM),
        },
      });
      await prisma.accessLog.create({
        data: {
          userId: user.id,
          deviceId: device.id,
          zoneId: zone.id,
          action: AccessAction.CHECK_OUT,
          sourceEventId: `demo-cn-${dayKey}-${p.code}-OUT`,
          isValid: true,
          eventAt: atLocal(day, p.outH, p.outM),
        },
      });
      logCount += 2;
    }
  }
  console.log(`  ${logCount} access log events`);

  // ── Snapshot headcount gần đây ─────────────────────────────
  console.log('Seeding headcount snapshots...');
  const contractors = [
    { id: hoaBinh.id, code: hoaBinh.code, name: hoaBinh.name, registered: 3, present: 3 },
    { id: cotec.id, code: cotec.code, name: cotec.name, registered: 2, present: 2 },
    { id: dien.id, code: dien.code, name: dien.name, registered: 2, present: 2 },
  ];
  for (let back = 0; back < 5; back++) {
    const d = new Date(today);
    d.setDate(d.getDate() - back);
    const date = dateOnlyUTC(d);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (const c of contractors) {
      const present = Math.max(1, c.present - (back % 2));
      await prisma.dailyContractorHeadcount.upsert({
        where: { date_contractorId: { date, contractorId: c.id } },
        create: {
          date,
          contractorId: c.id,
          headcount: present,
          payload: {
            date: dateStr,
            contractor: { id: c.id, code: c.code, name: c.name },
            registeredCount: c.registered,
            presentCount: present,
          },
          pushedAt: back === 0 ? new Date() : atLocal(d, 0, 10),
          pushStatus: back === 0 ? 'SKIPPED' : 'OK',
          pushError: null,
        },
        update: {
          headcount: present,
          payload: {
            date: dateStr,
            contractor: { id: c.id, code: c.code, name: c.name },
            registeredCount: c.registered,
            presentCount: present,
          },
          pushedAt: back === 0 ? new Date() : atLocal(d, 0, 10),
          pushStatus: back === 0 ? 'SKIPPED' : 'OK',
          pushError: null,
        },
      });
    }
  }
  console.log('  5 ngày × 3 nhà thầu snapshots');

  const staffPassword = process.env.STAFF_BOOTSTRAP_PASSWORD?.trim();
  if (staffPassword && staffPassword.length >= 8) {
    const staffRole = await prisma.role.upsert({
      where: { code: UserRole.STAFF },
      update: { name: 'Nhân viên vận hành' },
      create: {
        name: 'Nhân viên vận hành',
        code: UserRole.STAFF,
        description: 'Vận hành công trường theo dự án',
      },
    });
    const passwordHash = await bcrypt.hash(staffPassword, 12);
    const staffAccount = await prisma.account.upsert({
      where: { username: 'staff1' },
      update: {
        passwordHash,
        roleId: staffRole.id,
        isActive: true,
        isDeleted: false,
        mustChangePassword: true,
      },
      create: {
        username: 'staff1',
        passwordHash,
        roleId: staffRole.id,
        mustChangePassword: true,
      },
    });
    await prisma.accountProject.deleteMany({ where: { accountId: staffAccount.id } });
    await prisma.accountProject.create({
      data: { accountId: staffAccount.id, projectId: towerA.id },
    });
    console.log('  staff account staff1 → Tòa A (mustChangePassword=true)');
  }

  console.log('');
  console.log('Demo sẵn sàng:');
  console.log('  - Cài đặt → Nhà thầu & Dự án: 3 nhà thầu, 3 dự án');
  console.log('  - Báo cáo → /reports/contractors: vào/ra, theo ca, snapshot');
  console.log('  - Nhân sự filter Nhà thầu / loại CONTRACTOR');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
