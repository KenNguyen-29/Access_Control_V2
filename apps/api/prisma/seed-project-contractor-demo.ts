/**
 * Seed 10 projects x 10 contractors/project x 10 personnel/contractor.
 * Run: pnpm --filter @acv2/api prisma:seed:scale
 *
 * All records use the DEMO10- prefix so this seed is isolated and repeatable.
 */
import { PrismaClient, UserType } from '@prisma/client';

const prisma = new PrismaClient();

const PREFIX = 'DEMO10';
const PROJECT_COUNT = 10;
const CONTRACTORS_PER_PROJECT = 10;
const USERS_PER_CONTRACTOR = 10;

function projectCode(projectNo: number) {
  return `${PREFIX}-DA${String(projectNo).padStart(2, '0')}`;
}

function contractorCode(projectNo: number, contractorNo: number) {
  return `${PREFIX}-DA${String(projectNo).padStart(2, '0')}-NT${String(contractorNo).padStart(2, '0')}`;
}

function userCode(projectNo: number, contractorNo: number, userNo: number) {
  return `${contractorCode(projectNo, contractorNo)}-NV${String(userNo).padStart(2, '0')}`;
}

async function main() {
  let projectCount = 0;
  let contractorCount = 0;
  let userCount = 0;

  console.log(
    `Seeding ${PROJECT_COUNT} dự án x ${CONTRACTORS_PER_PROJECT} nhà thầu x ${USERS_PER_CONTRACTOR} nhân sự...`,
  );

  for (let p = 1; p <= PROJECT_COUNT; p += 1) {
    const pCode = projectCode(p);
    const project = await prisma.project.upsert({
      where: { code: pCode },
      update: {
        name: `Dự án mẫu ${String(p).padStart(2, '0')}`,
        siteName: `Công trường mẫu ${String(p).padStart(2, '0')}`,
        description: 'Dữ liệu mẫu phục vụ kiểm thử Access Control V2',
        isDeleted: false,
      },
      create: {
        code: pCode,
        name: `Dự án mẫu ${String(p).padStart(2, '0')}`,
        siteName: `Công trường mẫu ${String(p).padStart(2, '0')}`,
        description: 'Dữ liệu mẫu phục vụ kiểm thử Access Control V2',
      },
    });
    projectCount += 1;

    for (let c = 1; c <= CONTRACTORS_PER_PROJECT; c += 1) {
      const cCode = contractorCode(p, c);
      const contractor = await prisma.contractor.upsert({
        where: { code: cCode },
        update: {
          name: `Nhà thầu mẫu ${String(p).padStart(2, '0')}-${String(c).padStart(2, '0')}`,
          description: `Nhà thầu thuộc ${pCode}`,
          isDeleted: false,
        },
        create: {
          code: cCode,
          name: `Nhà thầu mẫu ${String(p).padStart(2, '0')}-${String(c).padStart(2, '0')}`,
          description: `Nhà thầu thuộc ${pCode}`,
        },
      });
      contractorCount += 1;

      await prisma.projectContractor.upsert({
        where: {
          projectId_contractorId: {
            projectId: project.id,
            contractorId: contractor.id,
          },
        },
        update: {},
        create: {
          projectId: project.id,
          contractorId: contractor.id,
        },
      });

      for (let u = 1; u <= USERS_PER_CONTRACTOR; u += 1) {
        const eCode = userCode(p, c, u);
        const sequence = (p - 1) * CONTRACTORS_PER_PROJECT * USERS_PER_CONTRACTOR
          + (c - 1) * USERS_PER_CONTRACTOR
          + u;
        await prisma.user.upsert({
          where: { employeeCode: eCode },
          update: {
            fullName: `Nhân sự mẫu ${String(p).padStart(2, '0')}-${String(c).padStart(2, '0')}-${String(u).padStart(2, '0')}`,
            email: `${eCode.toLowerCase()}@demo10.local`,
            phone: `09${String(sequence).padStart(8, '0')}`,
            citizenId: `0799${String(sequence).padStart(8, '0')}`,
            userType: UserType.CONTRACTOR,
            contractorId: contractor.id,
            projectId: project.id,
            isActive: true,
            isDeleted: false,
          },
          create: {
            employeeCode: eCode,
            fullName: `Nhân sự mẫu ${String(p).padStart(2, '0')}-${String(c).padStart(2, '0')}-${String(u).padStart(2, '0')}`,
            email: `${eCode.toLowerCase()}@demo10.local`,
            phone: `09${String(sequence).padStart(8, '0')}`,
            citizenId: `0799${String(sequence).padStart(8, '0')}`,
            userType: UserType.CONTRACTOR,
            contractorId: contractor.id,
            projectId: project.id,
          },
        });
        userCount += 1;
      }
    }

    console.log(`  ${pCode}: 10 nhà thầu, 100 nhân sự`);
  }

  const [projects, contractors, users, links] = await Promise.all([
    prisma.project.count({ where: { code: { startsWith: `${PREFIX}-` }, isDeleted: false } }),
    prisma.contractor.count({ where: { code: { startsWith: `${PREFIX}-` }, isDeleted: false } }),
    prisma.user.count({ where: { employeeCode: { startsWith: `${PREFIX}-` }, isDeleted: false } }),
    prisma.projectContractor.count({
      where: { project: { code: { startsWith: `${PREFIX}-` }, isDeleted: false } },
    }),
  ]);

  console.log('');
  console.log(`Upsert xong: ${projectCount} project, ${contractorCount} contractor, ${userCount} user.`);
  console.log(`Kiểm tra database: ${projects} project, ${contractors} contractor, ${users} user, ${links} liên kết.`);
  console.log('Mã mẫu: DEMO10-DA01, DEMO10-DA01-NT01, DEMO10-DA01-NT01-NV01');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
