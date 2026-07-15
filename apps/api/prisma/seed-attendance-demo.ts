import { PrismaClient, AttendanceStatus, CredentialType } from '@prisma/client';

const prisma = new PrismaClient();

// ── Cấu hình dữ liệu mẫu ──────────────────────────────────────
const DAYS_BACK = 30; // sinh chấm công cho 30 ngày gần nhất

type ShiftSeed = {
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  isOvernight: boolean;
  salaryCoefficient: number;
};

const SHIFTS: ShiftSeed[] = [
  { code: 'DAY', name: 'Ca Hành Chính', startTime: '08:00', endTime: '17:00', breakMinutes: 60, isOvernight: false, salaryCoefficient: 1 },
  { code: 'AFT', name: 'Ca Chiều', startTime: '13:00', endTime: '22:00', breakMinutes: 45, isOvernight: false, salaryCoefficient: 1.2 },
  { code: 'NIGHT', name: 'Ca Đêm', startTime: '22:00', endTime: '06:00', breakMinutes: 60, isOvernight: true, salaryCoefficient: 1.3 },
];

type DeptSeed = { code: string; name: string; description: string };
const DEPARTMENTS: DeptSeed[] = [
  { code: 'IT', name: 'Information Technology', description: 'Phòng Công nghệ thông tin' },
  { code: 'HR', name: 'Hành chính - Nhân sự', description: 'Phòng Hành chính nhân sự' },
  { code: 'SALES', name: 'Kinh doanh', description: 'Phòng Kinh doanh' },
];

type EmpSeed = {
  employeeCode: string;
  fullName: string;
  email: string;
  deptCode: string;
  shiftCode: string;
};

const EMPLOYEES: EmpSeed[] = [
  { employeeCode: 'EMP101', fullName: 'Trần Thị Bình', email: 'binh.tran@example.com', deptCode: 'HR', shiftCode: 'DAY' },
  { employeeCode: 'EMP102', fullName: 'Lê Văn Cường', email: 'cuong.le@example.com', deptCode: 'IT', shiftCode: 'DAY' },
  { employeeCode: 'EMP103', fullName: 'Phạm Thị Dung', email: 'dung.pham@example.com', deptCode: 'IT', shiftCode: 'NIGHT' },
  { employeeCode: 'EMP104', fullName: 'Hoàng Văn Em', email: 'em.hoang@example.com', deptCode: 'SALES', shiftCode: 'AFT' },
  { employeeCode: 'EMP105', fullName: 'Đỗ Thị Giang', email: 'giang.do@example.com', deptCode: 'SALES', shiftCode: 'DAY' },
  { employeeCode: 'EMP106', fullName: 'Vũ Văn Hùng', email: 'hung.vu@example.com', deptCode: 'HR', shiftCode: 'AFT' },
];

// Bộ sinh số giả ngẫu nhiên có seed để dữ liệu ổn định giữa các lần chạy
let seedState = 20260714;
function rand() {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
}
function randInt(min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function parseHHMM(value: string) {
  const [h, m] = value.split(':').map(Number);
  return { h, m };
}

/** Tạo Date theo giờ địa phương từ ngày gốc + HH:MM (+ offset ngày cho ca qua đêm). */
function atTime(baseDate: Date, hhmm: string, dayOffset = 0) {
  const { h, m } = parseHHMM(hhmm);
  const d = new Date(baseDate);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Ngày (chỉ phần date) theo UTC midnight để khớp cột @db.Date. */
function dateOnlyUTC(base: Date) {
  return new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate()));
}

async function main() {
  console.log('Seeding demo employees + attendance...');

  // 1) Phòng ban
  const deptByCode = new Map<string, string>();
  for (const d of DEPARTMENTS) {
    const dept = await prisma.department.upsert({
      where: { code: d.code },
      update: { name: d.name, description: d.description },
      create: d,
    });
    deptByCode.set(d.code, dept.id);
  }

  // 2) Ca làm (kèm hệ số lương)
  const shiftByCode = new Map<string, ShiftSeed & { id: string }>();
  for (const s of SHIFTS) {
    const shift = await prisma.workShift.upsert({
      where: { code: s.code },
      update: {
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime,
        breakMinutes: s.breakMinutes,
        isOvernight: s.isOvernight,
        salaryCoefficient: s.salaryCoefficient,
      },
      create: {
        code: s.code,
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime,
        breakMinutes: s.breakMinutes,
        isOvernight: s.isOvernight,
        salaryCoefficient: s.salaryCoefficient,
        isDefault: s.code === 'DAY',
      },
    });
    shiftByCode.set(s.code, { ...s, id: shift.id });
  }

  const today = new Date();
  const rangeStart = new Date(today);
  rangeStart.setDate(rangeStart.getDate() - DAYS_BACK);

  let attendanceCount = 0;

  // 3) Nhân viên + credential + phân ca + chấm công
  for (const emp of EMPLOYEES) {
    const departmentId = deptByCode.get(emp.deptCode)!;
    const shift = shiftByCode.get(emp.shiftCode)!;

    const user = await prisma.user.upsert({
      where: { employeeCode: emp.employeeCode },
      update: { fullName: emp.fullName, email: emp.email, departmentId },
      create: {
        employeeCode: emp.employeeCode,
        fullName: emp.fullName,
        email: emp.email,
        departmentId,
      },
    });

    await prisma.credential.upsert({
      where: { id: `seed-cred-${emp.employeeCode}` },
      update: {},
      create: {
        id: `seed-cred-${emp.employeeCode}`,
        userId: user.id,
        type: CredentialType.FACE,
        externalId: emp.employeeCode,
      },
    });

    // Phân ca: dọn phân ca demo cũ rồi tạo lại 1 phân ca đang hiệu lực
    await prisma.employeeShift.deleteMany({ where: { userId: user.id } });
    await prisma.employeeShift.create({
      data: {
        userId: user.id,
        workShiftId: shift.id,
        startDate: rangeStart,
      },
    });

    // Chấm công từng ngày trong khoảng
    for (let i = 0; i <= DAYS_BACK; i++) {
      const day = new Date(rangeStart);
      day.setDate(day.getDate() + i);
      const weekday = day.getDay(); // 0=CN, 6=T7

      // Nghỉ Chủ nhật; Thứ 7 chỉ ~40% có đi làm
      if (weekday === 0) continue;
      if (weekday === 6 && rand() > 0.4) continue;

      const dateVal = dateOnlyUTC(day);
      const overnightOffset = shift.isOvernight ? 1 : 0;

      // Chọn kịch bản theo xác suất
      const roll = rand();
      let status: AttendanceStatus = AttendanceStatus.ON_TIME;
      let lateMinutes = 0;
      let earlyLeaveMinutes = 0;
      let otMinutes = 0;
      let checkInAt: Date | null = null;
      let checkOutAt: Date | null = null;

      if (roll < 0.08) {
        // Vắng
        status = AttendanceStatus.ABSENT;
      } else {
        const start = atTime(day, shift.startTime);
        const end = atTime(day, shift.endTime, overnightOffset);

        if (roll < 0.28) {
          // Đi muộn
          lateMinutes = randInt(6, 40);
          status = AttendanceStatus.LATE;
          checkInAt = new Date(start.getTime() + lateMinutes * 60000);
          checkOutAt = new Date(end.getTime() + randInt(-5, 5) * 60000);
        } else if (roll < 0.42) {
          // Về sớm
          earlyLeaveMinutes = randInt(10, 50);
          status = AttendanceStatus.EARLY_LEAVE;
          checkInAt = new Date(start.getTime() - randInt(0, 8) * 60000);
          checkOutAt = new Date(end.getTime() - earlyLeaveMinutes * 60000);
        } else if (roll < 0.6) {
          // Tăng ca
          otMinutes = randInt(30, 150);
          status = AttendanceStatus.OVERTIME;
          checkInAt = new Date(start.getTime() - randInt(0, 6) * 60000);
          checkOutAt = new Date(end.getTime() + otMinutes * 60000);
        } else {
          // Đúng giờ
          status = AttendanceStatus.ON_TIME;
          checkInAt = new Date(start.getTime() - randInt(0, 10) * 60000);
          checkOutAt = new Date(end.getTime() + randInt(-3, 8) * 60000);
        }
      }

      await prisma.attendanceRecord.upsert({
        where: { userId_date: { userId: user.id, date: dateVal } },
        update: {
          workShiftId: shift.id,
          checkInAt,
          checkOutAt,
          status,
          lateMinutes,
          earlyLeaveMinutes,
          otMinutes,
        },
        create: {
          userId: user.id,
          workShiftId: shift.id,
          date: dateVal,
          checkInAt,
          checkOutAt,
          status,
          lateMinutes,
          earlyLeaveMinutes,
          otMinutes,
        },
      });
      attendanceCount++;
    }

    console.log(`  ✓ ${emp.employeeCode} - ${emp.fullName} (${emp.deptCode}/${shift.code})`);
  }

  console.log(`Demo seed completed: ${EMPLOYEES.length} nhân viên, ${attendanceCount} bản ghi chấm công (~${DAYS_BACK} ngày).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
