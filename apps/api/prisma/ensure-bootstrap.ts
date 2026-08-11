import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const DEFAULT_PASSWORD = 'admin123';

const ROLES: Array<{ name: string; code: UserRole; description: string }> = [
  { name: 'Administrator', code: UserRole.ADMIN, description: 'Full system access' },
  { name: 'HR Manager', code: UserRole.HR, description: 'HR and attendance management' },
  { name: 'Security Guard', code: UserRole.SECURITY, description: 'Live monitoring dashboard' },
  { name: 'Technician', code: UserRole.TECHNICIAN, description: 'Device maintenance' },
  { name: 'Nhân viên vận hành', code: UserRole.STAFF, description: 'Site operations — scoped by project' },
];

const ACCOUNTS: Array<{
  username: string;
  role: UserRole;
  passwordEnv?: string;
}> = [
  { username: 'admin', role: UserRole.ADMIN, passwordEnv: 'ADMIN_BOOTSTRAP_PASSWORD' },
  { username: 'hr1', role: UserRole.HR },
  { username: 'staff1', role: UserRole.STAFF },
];

function passwordFor(envKey?: string) {
  const fromEnv = envKey ? process.env[envKey]?.trim() : undefined;
  if (fromEnv && fromEnv.length >= 8) return fromEnv;
  const fallback = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim();
  if (fallback && fallback.length >= 8) return fallback;
  return DEFAULT_PASSWORD;
}

/** Always upsert 5 roles + demo login accounts (create if missing, never reset existing password). */
export async function ensureRolesAndAdmin(prisma: PrismaClient) {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { isDeleted: false, name: role.name, description: role.description },
      create: role,
    });
  }

  const roles = await prisma.role.findMany({ where: { isDeleted: false } });
  const roleByCode = new Map(roles.map((r) => [r.code, r]));

  const firstProject = await prisma.project.findFirst({
    where: { isDeleted: false },
    orderBy: { name: 'asc' },
  });

  for (const spec of ACCOUNTS) {
    const role = roleByCode.get(spec.role);
    if (!role) throw new Error(`Missing role ${spec.role}`);

    const username =
      spec.role === UserRole.ADMIN
        ? (process.env.ADMIN_BOOTSTRAP_USERNAME || spec.username).trim()
        : spec.username;

    const existing = await prisma.account.findUnique({ where: { username } });
    if (existing) {
      await prisma.account.update({
        where: { id: existing.id },
        data: { isDeleted: false, isActive: true, roleId: role.id },
      });
      console.log(`  account "${username}" already exists — kept password, role=${spec.role}`);
      continue;
    }

    const passwordHash = await bcrypt.hash(passwordFor(spec.passwordEnv), 12);
    const created = await prisma.account.create({
      data: {
        username,
        passwordHash,
        roleId: role.id,
        mustChangePassword: true,
        isActive: true,
      },
    });

    if ((spec.role === UserRole.STAFF || spec.role === UserRole.HR) && firstProject) {
      await prisma.accountProject.upsert({
        where: {
          accountId_projectId: { accountId: created.id, projectId: firstProject.id },
        },
        update: {},
        create: { accountId: created.id, projectId: firstProject.id },
      });
      console.log(
        `  created account "${username}" / ${DEFAULT_PASSWORD} (${spec.role}) → project ${firstProject.name}`,
      );
    } else {
      console.log(`  created account "${username}" / ${DEFAULT_PASSWORD} (${spec.role})`);
    }
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('Ensuring roles + login accounts...');
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
