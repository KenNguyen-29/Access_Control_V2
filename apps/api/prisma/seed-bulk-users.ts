/**
 * Sinh ~1000 nhân viên mẫu để test hiệu năng web (danh sách, phân quyền, gán ca).
 * Chạy: pnpm --filter @acv2/api prisma:seed:bulk
 */
import { PrismaClient, UserType } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_COUNT = 1000;
const CODE_PREFIX = 'PERF';
const BATCH_SIZE = 100;

const DEPARTMENTS = [
  { code: 'PERF-IT', name: 'Công nghệ thông tin' },
  { code: 'PERF-HR', name: 'Hành chính - Nhân sự' },
  { code: 'PERF-SALES', name: 'Kinh doanh' },
  { code: 'PERF-PROD', name: 'Sản xuất' },
  { code: 'PERF-QC', name: 'Kiểm soát chất lượng' },
  { code: 'PERF-LOG', name: 'Kho vận' },
  { code: 'PERF-FIN', name: 'Kế toán' },
  { code: 'PERF-SEC', name: 'An ninh' },
] as const;

const FAMILY = [
  'Nguyễn',
  'Trần',
  'Lê',
  'Phạm',
  'Hoàng',
  'Huỳnh',
  'Phan',
  'Vũ',
  'Võ',
  'Đặng',
  'Bùi',
  'Đỗ',
  'Hồ',
  'Ngô',
  'Dương',
  'Lý',
];

const MIDDLE = ['Văn', 'Thị', 'Đức', 'Minh', 'Hữu', 'Ngọc', 'Quốc', 'Thanh'];

const GIVEN = [
  'An',
  'Bình',
  'Chi',
  'Cường',
  'Dung',
  'Em',
  'Giang',
  'Hà',
  'Hùng',
  'Khánh',
  'Lan',
  'Long',
  'Mai',
  'Nam',
  'Oanh',
  'Phúc',
  'Quân',
  'Sơn',
  'Tâm',
  'Uyên',
  'Vinh',
  'Xuân',
  'Yến',
];

function pick<T>(arr: readonly T[], index: number): T {
  return arr[index % arr.length]!;
}

function buildFullName(index: number): string {
  const family = pick(FAMILY, index);
  const middle = pick(MIDDLE, Math.floor(index / FAMILY.length));
  const given = pick(GIVEN, Math.floor(index / (FAMILY.length * MIDDLE.length)));
  return `${family} ${middle} ${given}`;
}

function employeeCode(seq: number): string {
  return `${CODE_PREFIX}-${String(seq).padStart(4, '0')}`;
}

async function ensureDepartments(): Promise<string[]> {
  const ids: string[] = [];
  for (const dept of DEPARTMENTS) {
    const row = await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name },
      create: {
        code: dept.code,
        name: dept.name,
        description: 'Dữ liệu test hiệu năng',
      },
    });
    ids.push(row.id);
  }
  return ids;
}

async function main() {
  console.log(`Đang tạo tối đa ${TARGET_COUNT} nhân viên (${CODE_PREFIX}-0001 …)...`);

  const deptIds = await ensureDepartments();
  const existing = await prisma.user.count({
    where: { employeeCode: { startsWith: `${CODE_PREFIX}-` }, isDeleted: false },
  });

  if (existing >= TARGET_COUNT) {
    console.log(`Đã có ${existing} nhân viên ${CODE_PREFIX}-*, không cần tạo thêm.`);
    return;
  }

  const toCreate = TARGET_COUNT - existing;
  let created = 0;
  let skipped = 0;
  const startSeq = existing + 1;

  for (let offset = 0; offset < toCreate; offset += BATCH_SIZE) {
    const batch: Array<{
      employeeCode: string;
      fullName: string;
      email: string;
      phone: string;
      departmentId: string;
      userType: UserType;
      isActive: boolean;
    }> = [];

    const limit = Math.min(BATCH_SIZE, toCreate - offset);
    for (let i = 0; i < limit; i++) {
      const seq = startSeq + offset + i;
      const code = employeeCode(seq);
      batch.push({
        employeeCode: code,
        fullName: buildFullName(seq),
        email: `${code.toLowerCase()}@perf.test`,
        phone: `09${String(10000000 + seq).slice(-8)}`,
        departmentId: pick(deptIds, seq),
        userType: UserType.EMPLOYEE,
        isActive: true,
      });
    }

    const result = await prisma.user.createMany({ data: batch, skipDuplicates: true });
    created += result.count;
    skipped += batch.length - result.count;
    console.log(`  batch ${Math.floor(offset / BATCH_SIZE) + 1}: +${result.count}`);
  }

  const total = await prisma.user.count({
    where: { employeeCode: { startsWith: `${CODE_PREFIX}-` }, isDeleted: false },
  });

  console.log('');
  console.log(`Xong: tạo mới ${created}, bỏ qua ${skipped} (trùng mã).`);
  console.log(`Tổng nhân viên ${CODE_PREFIX}-*: ${total}`);
  console.log(`Phòng ban: ${DEPARTMENTS.map((d) => d.name).join(', ')}`);
  console.log('');
  console.log('Gợi ý test: mở Nhân sự, Kiểm soát ra vào, Gán ca — tìm "PERF-" hoặc lọc phòng ban.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
