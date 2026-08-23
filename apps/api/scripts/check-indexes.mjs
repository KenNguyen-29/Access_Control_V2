import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const indexes = await prisma.$queryRaw`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN (
        'access_logs', 'user_presence', 'devices', 'attendance_records',
        'users', 'employee_shifts'
      )
    ORDER BY tablename, indexname
  `;

  const counts = await prisma.$queryRaw`
    SELECT relname AS table, n_live_tup::bigint AS rows
    FROM pg_stat_user_tables
    WHERE relname IN (
      'access_logs', 'user_presence', 'devices', 'attendance_records',
      'users', 'employee_shifts'
    )
    ORDER BY n_live_tup DESC
  `;

  console.log('=== INDEXES ===');
  console.log(JSON.stringify(indexes, null, 2));
  console.log('\n=== ROW COUNTS (approx) ===');
  for (const row of counts) {
    console.log(`${row.table}: ${String(row.rows)}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
