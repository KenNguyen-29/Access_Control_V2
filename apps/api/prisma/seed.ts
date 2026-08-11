import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = 'admin123';

const ROLES: Array<{ name: string; code: UserRole; description: string }> = [
  { name: 'Administrator', code: UserRole.ADMIN, description: 'Full system access' },
  { name: 'HR Manager', code: UserRole.HR, description: 'HR and attendance management' },
  { name: 'Security Guard', code: UserRole.SECURITY, description: 'Live monitoring dashboard' },
  { name: 'Technician', code: UserRole.TECHNICIAN, description: 'Device maintenance' },
  { name: 'Nhân viên vận hành', code: UserRole.STAFF, description: 'Site operations — scoped by project' },
];

async function main() {
  console.log('Seeding roles + default admin...');

  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { isDeleted: false, name: role.name, description: role.description },
      create: role,
    });
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: UserRole.ADMIN } });
  const username = (process.env.ADMIN_BOOTSTRAP_USERNAME || DEFAULT_USERNAME).trim();
  const password = (process.env.ADMIN_BOOTSTRAP_PASSWORD || DEFAULT_PASSWORD).trim();
  if (password.length < 8) {
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD must be at least 8 characters');
  }

  const existing = await prisma.account.findUnique({ where: { username } });
  if (existing) {
    await prisma.account.update({
      where: { id: existing.id },
      data: { isDeleted: false, isActive: true, roleId: adminRole.id },
    });
    console.log(`  roles OK · account "${username}" already exists (password unchanged)`);
  } else {
    await prisma.account.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(password, 12),
        roleId: adminRole.id,
        mustChangePassword: true,
        isActive: true,
      },
    });
    console.log(`  created admin "${username}" / ${DEFAULT_PASSWORD} — đổi mật khẩu sau khi đăng nhập`);
  }

  console.log('Seed completed. Dropdown vai trò: ADMIN, HR, SECURITY, TECHNICIAN, STAFF');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
