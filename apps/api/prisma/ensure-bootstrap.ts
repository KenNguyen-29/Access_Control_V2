import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const DEFAULT_ADMIN_USER = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123';

const ROLES: Array<{ name: string; code: UserRole; description: string }> = [
  { name: 'Administrator', code: UserRole.ADMIN, description: 'Full system access' },
  { name: 'HR Manager', code: UserRole.HR, description: 'HR and attendance management' },
  { name: 'Security Guard', code: UserRole.SECURITY, description: 'Live monitoring dashboard' },
  { name: 'Technician', code: UserRole.TECHNICIAN, description: 'Device maintenance' },
  { name: 'Nhân viên vận hành', code: UserRole.STAFF, description: 'Site operations — scoped by project' },
];

/** Upsert 5 login roles. If the DB has no account yet, create admin (mustChangePassword). */
export async function ensureRolesAndAdmin(prisma: PrismaClient) {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { isDeleted: false, name: role.name, description: role.description },
      create: role,
    });
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: UserRole.ADMIN } });
  const existingCount = await prisma.account.count({ where: { isDeleted: false } });
  if (existingCount > 0) {
    console.log(`Roles OK · ${existingCount} account(s) already exist — skip bootstrap admin`);
    return;
  }

  const username = (process.env.ADMIN_BOOTSTRAP_USERNAME || DEFAULT_ADMIN_USER).trim();
  const password = (process.env.ADMIN_BOOTSTRAP_PASSWORD || DEFAULT_ADMIN_PASSWORD).trim();
  if (password.length < 8) {
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD must be at least 8 characters');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.account.create({
    data: {
      username,
      passwordHash,
      roleId: adminRole.id,
      mustChangePassword: true,
      isActive: true,
    },
  });
  console.log(
    `Created first admin "${username}" (password from env or default admin123). Change password after login.`,
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await ensureRolesAndAdmin(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
