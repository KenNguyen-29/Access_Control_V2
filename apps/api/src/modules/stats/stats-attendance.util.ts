import { Prisma } from '@prisma/client';

export type AttendanceUserScope = {
  departmentId?: string;
  contractorId?: string;
  projectId?: string;
};

export function buildAttendanceUserFilter(scope: AttendanceUserScope): Prisma.UserWhereInput {
  return {
    isDeleted: false,
    ...(scope.departmentId ? { departmentId: scope.departmentId } : {}),
    ...(scope.contractorId ? { contractorId: scope.contractorId } : {}),
    ...(scope.projectId ? { projectId: scope.projectId } : {}),
  };
}

export function buildAttendanceRecordWhere(
  from: Date,
  toExclusive: Date,
  scope: AttendanceUserScope,
): Prisma.AttendanceRecordWhereInput {
  return {
    workShiftId: { not: null },
    date: { gte: from, lt: toExclusive },
    user: buildAttendanceUserFilter(scope),
  };
}

export function buildUserSearchSql(search: string | undefined, alias = 'u'): Prisma.Sql {
  const q = search?.trim();
  if (!q) return Prisma.empty;
  const pattern = `%${q}%`;
  return Prisma.sql`AND (
    ${Prisma.raw(alias)}."fullName" ILIKE ${pattern}
    OR ${Prisma.raw(alias)}."employeeCode" ILIKE ${pattern}
    OR COALESCE(${Prisma.raw(alias)}."citizenId", '') ILIKE ${pattern}
  )`;
}

export function workedMinutesSql(alias = 'ar'): Prisma.Sql {
  return Prisma.sql`
    CASE
      WHEN ${Prisma.raw(alias)}."checkInAt" IS NOT NULL
        AND ${Prisma.raw(alias)}."checkOutAt" IS NOT NULL
      THEN LEAST(
        1440,
        FLOOR(
          EXTRACT(EPOCH FROM (${Prisma.raw(alias)}."checkOutAt" - ${Prisma.raw(alias)}."checkInAt")) / 60
        )::int
      )
      ELSE 0
    END
  `;
}
