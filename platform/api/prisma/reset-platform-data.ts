import { PrismaClient } from '@prisma/client';
import { rm } from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  if (process.env.CONFIRM_PLATFORM_RESET !== 'YES') {
    throw new Error('Refuse to reset data. Set CONFIRM_PLATFORM_RESET=YES to continue.');
  }

  const adminUsers = await prisma.user.findMany({
    where: { isPlatformAdmin: true },
    select: { id: true, email: true },
  });
  const adminUserIds = adminUsers.map((user) => user.id);

  await prisma.$transaction([
    prisma.refreshToken.deleteMany({}),
    prisma.authorizationCode.deleteMany({}),
    prisma.courseLaunchSession.deleteMany({}),
    prisma.learningRecord.deleteMany({}),
    prisma.courseAssignment.deleteMany({}),
    prisma.courseware.deleteMany({}),
    prisma.course.deleteMany({}),
    prisma.applicationUser.deleteMany({}),
    prisma.applicationClassAccess.deleteMany({}),
    prisma.applicationOrganizationAccess.deleteMany({}),
    prisma.application.deleteMany({}),
    prisma.userClass.deleteMany({}),
    prisma.userOrganization.deleteMany({}),
    prisma.class.deleteMany({}),
    prisma.organization.deleteMany({}),
    prisma.user.deleteMany({
      where: {
        id: { notIn: adminUserIds },
      },
    }),
  ]);

  if (process.env.CLEAR_COURSE_RUNTIME_FILES === 'true') {
    const configuredRoot = process.env.COURSE_RUNTIME_ROOT?.trim();
    const runtimeRoot = configuredRoot || path.join(process.cwd(), 'course-runtime');
    await rm(runtimeRoot, { recursive: true, force: true });
    console.log(`Course runtime files removed: ${runtimeRoot}`);
  }

  console.log('Platform business data reset completed.');
  console.log(`Preserved platform admins: ${adminUsers.map((user) => user.email).join(', ')}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
