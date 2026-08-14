const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { createHash } = require('crypto');

const prisma = new PrismaClient();
const migrationsDir = path.join(__dirname, 'prisma', 'migrations');

function checksum(sql) {
  // Prisma 6 uses sha256 hex of migration file contents
  return createHash('sha256').update(sql).digest('hex');
}

async function main() {
  const before = await prisma.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'access_logs' AND column_name = 'projectId'
  `);
  const dnake = await prisma.$queryRawUnsafe(`
    SELECT e.enumlabel FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'DeviceType' AND e.enumlabel = 'DNAKE'
  `);
  const transfers = await prisma.$queryRawUnsafe(`
    SELECT to_regclass('public.user_project_transfers') AS reg
  `);
  console.log('before', { projectId: before, DNAKE: dnake, transfers });

  const dnakeSql = fs.readFileSync(
    path.join(migrationsDir, '20260812120000_add_dnake', 'migration.sql'),
    'utf8',
  );
  const transferSql = fs.readFileSync(
    path.join(migrationsDir, '20260814120000_project_transfer_accesslog', 'migration.sql'),
    'utf8',
  );

  await prisma.$executeRawUnsafe(dnakeSql);
  await prisma.$executeRawUnsafe(transferSql);

  // Align migration history with the squashed local folders (keep data).
  await prisma.$executeRawUnsafe(`DELETE FROM "_prisma_migrations"`);

  const names = [
    '20260811120000_init',
    '20260812120000_add_dnake',
    '20260814120000_project_transfer_accesslog',
  ];
  for (const name of names) {
    const sql = fs.readFileSync(path.join(migrationsDir, name, 'migration.sql'), 'utf8');
    await prisma.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations"
        (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES
        ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
      cryptoRandomId(),
      checksum(sql),
      name,
    );
  }

  const after = await prisma.$queryRawUnsafe(`
    SELECT migration_name FROM "_prisma_migrations" ORDER BY migration_name
  `);
  const projectId = await prisma.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'access_logs' AND column_name = 'projectId'
  `);
  const table = await prisma.$queryRawUnsafe(`
    SELECT to_regclass('public.user_project_transfers') AS reg
  `);
  console.log('after', { migrations: after, projectId, table });
}

function cryptoRandomId() {
  return require('crypto').randomBytes(16).toString('hex');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
