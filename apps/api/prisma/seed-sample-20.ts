/**
 * Seed ~20 bản ghi mẫu cho các bảng nghiệp vụ (UI / báo cáo).
 * Idempotent qua mã cố định tiền tố S20-.
 *
 * Chạy: pnpm --filter @acv2/api prisma:seed:sample20
 */
import {
  AccessAction,
  AttendanceStatus,
  CredentialType,
  DeviceType,
  PrismaClient,
  UserType,
} from '@prisma/client';

const prisma = new PrismaClient();
const N = 20;
const PREFIX = 'S20';

const FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng'];
const MIDDLE = ['Văn', 'Thị', 'Đức', 'Minh', 'Hữu', 'Ngọc', 'Quốc', 'Thanh'];
const GIVEN = [
  'An', 'Bình', 'Cường', 'Dũng', 'Em', 'Giang', 'Hùng', 'Khánh', 'Lan', 'Long',
  'Mai', 'Nam', 'Oanh', 'Phúc', 'Quân', 'Sơn', 'Tâm', 'Uyên', 'Vinh', 'Yến',
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function fullName(i: number) {
  return `${FAMILY[(i - 1) % FAMILY.length]} ${MIDDLE[(i - 1) % MIDDLE.length]} ${GIVEN[(i - 1) % GIVEN.length]}`;
}

function dateOnlyUTC(d: Date) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function atLocal(base: Date, h: number, m: number) {
  const x = new Date(base);
  x.setHours(h, m, 0, 0);
  return x;
}

async function main() {
  console.log(`Seeding ${N} sample rows per table (prefix ${PREFIX}-)...`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayUtc = dateOnlyUTC(today);
  const monthStart = dateOnlyUTC(new Date(today.getFullYear(), today.getMonth(), 1));

  // ── Departments ──────────────────────────────────────────
  const departments = [];
  for (let i = 1; i <= N; i++) {
    const code = `${PREFIX}-PB${pad(i)}`;
    departments.push(
      await prisma.department.upsert({
        where: { code },
        update: { name: `Phòng ban mẫu ${pad(i)}`, isDeleted: false },
        create: { code, name: `Phòng ban mẫu ${pad(i)}`, description: 'Sample S20' },
      }),
    );
  }
  console.log(`  departments: ${departments.length}`);

  // ── Contractors ──────────────────────────────────────────
  const contractors = [];
  for (let i = 1; i <= N; i++) {
    const code = `${PREFIX}-NT${pad(i)}`;
    contractors.push(
      await prisma.contractor.upsert({
        where: { code },
        update: { name: `Nhà thầu mẫu ${pad(i)}`, isDeleted: false },
        create: {
          code,
          name: `Nhà thầu mẫu ${pad(i)}`,
          description: `Công ty nhà thầu demo ${pad(i)}`,
        },
      }),
    );
  }
  console.log(`  contractors: ${contractors.length}`);

  // ── Projects (+ links) ───────────────────────────────────
  const projects = [];
  for (let i = 1; i <= N; i++) {
    const code = `${PREFIX}-DA${pad(i)}`;
    const project = await prisma.project.upsert({
      where: { code },
      update: {
        name: `Dự án mẫu ${pad(i)}`,
        siteName: `Công trường ${pad(i)}`,
        isDeleted: false,
      },
      create: {
        code,
        name: `Dự án mẫu ${pad(i)}`,
        siteName: `Công trường ${pad(i)}`,
        description: 'Sample S20',
      },
    });
    projects.push(project);
    const contractor = contractors[(i - 1) % contractors.length]!;
    await prisma.projectContractor.deleteMany({ where: { projectId: project.id } });
    await prisma.projectContractor.create({
      data: { projectId: project.id, contractorId: contractor.id },
    });
  }
  console.log(`  projects: ${projects.length}`);

  // ── Access zones ─────────────────────────────────────────
  const zones = [];
  for (let i = 1; i <= N; i++) {
    const id = `${PREFIX.toLowerCase()}-zone-${pad(i)}`;
    zones.push(
      await prisma.accessZone.upsert({
        where: { id },
        update: { name: `Khu vực mẫu ${pad(i)}`, isDeleted: false },
        create: {
          id,
          name: `Khu vực mẫu ${pad(i)}`,
          description: 'Sample S20',
        },
      }),
    );
  }
  console.log(`  access_zones: ${zones.length}`);

  // ── Devices ──────────────────────────────────────────────
  const devices = [];
  for (let i = 1; i <= N; i++) {
    const code = `${PREFIX}-DEV-${pad(i)}`;
    const type = i % 3 === 0 ? DeviceType.CAMERA : i % 2 === 0 ? DeviceType.DNAKE : DeviceType.AKUVOX;
    devices.push(
      await prisma.device.upsert({
        where: { code },
        update: {
          name: `Thiết bị mẫu ${pad(i)}`,
          zoneId: zones[(i - 1) % zones.length]!.id,
          isDeleted: false,
          isOnline: true,
        },
        create: {
          code,
          name: `Thiết bị mẫu ${pad(i)}`,
          deviceType: type,
          ipAddress: `192.168.20.${i}`,
          location: `Cổng ${pad(i)}`,
          zoneId: zones[(i - 1) % zones.length]!.id,
          isOnline: true,
        },
      }),
    );
  }
  console.log(`  devices: ${devices.length}`);

  // ── Work shifts ──────────────────────────────────────────
  const shifts = [];
  for (let i = 1; i <= N; i++) {
    const code = `${PREFIX}-CA${pad(i)}`;
    const startH = 6 + ((i - 1) % 8);
    const endH = Math.min(23, startH + 8);
    shifts.push(
      await prisma.workShift.upsert({
        where: { code },
        update: {
          name: `Ca mẫu ${pad(i)}`,
          startTime: `${pad(startH)}:00`,
          endTime: `${pad(endH)}:00`,
          isDeleted: false,
        },
        create: {
          code,
          name: `Ca mẫu ${pad(i)}`,
          startTime: `${pad(startH)}:00`,
          endTime: `${pad(endH)}:00`,
          breakMinutes: 60,
          salaryCoefficient: 1 + (i % 5) * 0.05,
          isOvernight: false,
          isDefault: false,
        },
      }),
    );
  }
  console.log(`  work_shifts: ${shifts.length}`);

  // ── Users (+ credentials, permissions, shifts) ───────────
  const users = [];
  for (let i = 1; i <= N; i++) {
    const employeeCode = `${PREFIX}-NV${pad(i)}`;
    const citizenId = `07908520${String(1000 + i).slice(-4)}${pad(i)}`;
    const contractor = contractors[(i - 1) % contractors.length]!;
    const project = projects[(i - 1) % projects.length]!;
    const department = departments[(i - 1) % departments.length]!;
    const existing = await prisma.user.findFirst({
      where: { OR: [{ employeeCode }, { citizenId }] },
    });
    const data = {
      fullName: fullName(i),
      email: `s20.nv${pad(i)}@demo.local`,
      phone: `0902${String(1000000 + i).slice(-6)}`,
      citizenId,
      userType: UserType.CONTRACTOR,
      departmentId: department.id,
      contractorId: contractor.id,
      projectId: project.id,
      isActive: true,
      isDeleted: false,
    };
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data })
      : await prisma.user.create({ data: { employeeCode, ...data } });
    users.push(user);

    const credId = `${PREFIX.toLowerCase()}-cred-${pad(i)}`;
    await prisma.credential.upsert({
      where: { id: credId },
      update: { userId: user.id, isDeleted: false, isActive: true },
      create: {
        id: credId,
        userId: user.id,
        type: CredentialType.FACE,
        externalId: `face-${employeeCode}`,
      },
    });

    const zone = zones[(i - 1) % zones.length]!;
    await prisma.userAccessPermission.upsert({
      where: { userId_zoneId: { userId: user.id, zoneId: zone.id } },
      update: { isDeleted: false },
      create: { userId: user.id, zoneId: zone.id },
    });

    const device = devices[(i - 1) % devices.length]!;
    await prisma.userDevicePermission.upsert({
      where: { userId_deviceId: { userId: user.id, deviceId: device.id } },
      update: { isDeleted: false, isActive: true },
      create: { userId: user.id, deviceId: device.id },
    });

    const shift = shifts[(i - 1) % shifts.length]!;
    const existingAssign = await prisma.employeeShift.findFirst({
      where: {
        userId: user.id,
        workShiftId: shift.id,
        isDeleted: false,
        endDate: null,
      },
    });
    if (existingAssign) {
      await prisma.employeeShift.update({
        where: { id: existingAssign.id },
        data: { startDate: monthStart },
      });
    } else {
      await prisma.employeeShift.create({
        data: {
          userId: user.id,
          workShiftId: shift.id,
          startDate: monthStart,
          endDate: null,
          assignmentType: 'RANGED',
        },
      });
    }
  }
  console.log(`  users / credentials / permissions / employee_shifts: ${users.length}`);

  // ── Access logs (20 in + 20 out = 40 rows for richer tables; still ≥20) ──
  await prisma.accessLog.deleteMany({
    where: { sourceEventId: { startsWith: `${PREFIX.toLowerCase()}-log-` } },
  });
  const accessLogsData = [];
  for (let i = 1; i <= N; i++) {
    const user = users[i - 1]!;
    const device = devices[(i - 1) % devices.length]!;
    const zone = zones[(i - 1) % zones.length]!;
    const inAt = atLocal(today, 7 + (i % 3), 10 + i);
    const outAt = atLocal(today, 16 + (i % 2), 20 + i);
    accessLogsData.push(
      {
        userId: user.id,
        deviceId: device.id,
        zoneId: zone.id,
        projectId: user.projectId,
        action: AccessAction.CHECK_IN,
        eventAt: inAt,
        isValid: true,
        sourceEventId: `${PREFIX.toLowerCase()}-log-in-${pad(i)}`,
      },
      {
        userId: user.id,
        deviceId: device.id,
        zoneId: zone.id,
        projectId: user.projectId,
        action: AccessAction.CHECK_OUT,
        eventAt: outAt,
        isValid: true,
        sourceEventId: `${PREFIX.toLowerCase()}-log-out-${pad(i)}`,
      },
    );
  }
  await prisma.accessLog.createMany({ data: accessLogsData });
  console.log(`  access_logs: ${accessLogsData.length}`);

  // ── Attendance records ───────────────────────────────────
  for (let i = 1; i <= N; i++) {
    const user = users[i - 1]!;
    const shift = shifts[(i - 1) % shifts.length]!;
    const checkInAt = atLocal(today, 7 + (i % 3), 15);
    const checkOutAt = atLocal(today, 17, 5 + (i % 20));
    const lateMinutes = i % 4 === 0 ? 10 + i : 0;
    const otMinutes = i % 3 === 0 ? 30 : 0;
    await prisma.attendanceRecord.upsert({
      where: {
        userId_date: {
          userId: user.id,
          date: todayUtc,
        },
      },
      update: {
        workShiftId: shift.id,
        checkInAt,
        checkOutAt,
        lateMinutes,
        otMinutes,
        status: lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.ON_TIME,
      },
      create: {
        userId: user.id,
        date: todayUtc,
        workShiftId: shift.id,
        checkInAt,
        checkOutAt,
        lateMinutes,
        earlyLeaveMinutes: 0,
        otMinutes,
        status: lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.ON_TIME,
      },
    });
  }
  console.log(`  attendance_records: ${N}`);

  // ── Daily contractor headcount ───────────────────────────
  for (let i = 1; i <= N; i++) {
    const contractor = contractors[i - 1]!;
    await prisma.dailyContractorHeadcount.upsert({
      where: {
        date_contractorId: { date: todayUtc, contractorId: contractor.id },
      },
      update: {
        headcount: 5 + (i % 10),
        projectId: projects[(i - 1) % projects.length]!.id,
        payload: {
          sample: true,
          registeredCount: 8 + (i % 5),
          presentCount: 5 + (i % 10),
        },
      },
      create: {
        date: todayUtc,
        contractorId: contractor.id,
        projectId: projects[(i - 1) % projects.length]!.id,
        headcount: 5 + (i % 10),
        payload: {
          sample: true,
          registeredCount: 8 + (i % 5),
          presentCount: 5 + (i % 10),
        },
      },
    });
  }
  console.log(`  daily_contractor_headcounts: ${N}`);

  // ── Presence ─────────────────────────────────────────────
  for (let i = 1; i <= N; i++) {
    const user = users[i - 1]!;
    const zone = zones[(i - 1) % zones.length]!;
    await prisma.userPresence.upsert({
      where: { userId: user.id },
      update: {
        currentZoneId: zone.id,
        currentStatus: i % 2 === 0 ? 'INSIDE' : 'OUTSIDE',
        lastEventTime: atLocal(today, 12, i),
      },
      create: {
        userId: user.id,
        currentZoneId: zone.id,
        currentStatus: i % 2 === 0 ? 'INSIDE' : 'OUTSIDE',
        lastEventTime: atLocal(today, 12, i),
      },
    });
  }
  console.log(`  user_presence: ${N}`);

  // ── Audit logs ───────────────────────────────────────────
  await prisma.auditLog.deleteMany({
    where: { action: { startsWith: `${PREFIX}_` } },
  });
  await prisma.auditLog.createMany({
    data: Array.from({ length: N }, (_, idx) => {
      const i = idx + 1;
      return {
        action: `${PREFIX}_SAMPLE_${pad(i)}`,
        entity: 'Sample',
        entityId: `${PREFIX}-${pad(i)}`,
        metadata: { note: `Audit mẫu ${pad(i)}` },
      };
    }),
  });
  console.log(`  audit_logs: ${N}`);

  console.log('Done. Mở /projects, /users, /shifts, /reports, /reports/contractors để xem.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
