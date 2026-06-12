import {
  ClassMemberRole,
  CourseOwnerType,
  CourseRuntimeType,
  CourseStatus,
  LearningRecordStatus,
  PrismaClient,
  RoleScope,
  UserApprovalStatus,
  UserType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminUsername = process.env.ADMIN_USERNAME ?? 'admin';
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';
  const demoAppSecret = process.env.DEMO_APP_SECRET ?? 'demo-app-secret';
  const mandarinAppSecret =
    process.env.MANDARIN_APP_SECRET ?? 'mandarin-practice-secret';
  const platformPublicUrl = process.env.PLATFORM_PUBLIC_URL?.replace(/\/$/, '');
  const registrationDoneUri = platformPublicUrl
    ? `${platformPublicUrl}/registration/done`
    : undefined;
  const registrationDoneUris = registrationDoneUri
    ? [
        registrationDoneUri,
        `${registrationDoneUri}?role=student`,
        `${registrationDoneUri}?role=teacher`,
      ]
    : [];
  const demoAllowedOrigins = [
    'http://localhost:3001',
    ...(platformPublicUrl ? [platformPublicUrl] : []),
  ];
  const demoRedirectUris = [
    'http://localhost:3001/auth/callback',
    ...registrationDoneUris,
  ];

  const adminPasswordHash = await bcrypt.hash(adminPassword, 12);
  const demoPasswordHash = await bcrypt.hash('ChangeMe123!', 12);
  const demoAppSecretHash = await bcrypt.hash(demoAppSecret, 12);
  const mandarinAppSecretHash = await bcrypt.hash(mandarinAppSecret, 12);

  const platformAdminRole = await prisma.role.upsert({
    where: { key: 'platform.admin' },
    update: {},
    create: {
      key: 'platform.admin',
      name: '平台管理员',
      scope: RoleScope.PLATFORM,
      permissions: ['platform:*'],
    },
  });

  const teacherRole = await prisma.role.upsert({
    where: { key: 'organization.teacher' },
    update: {},
    create: {
      key: 'organization.teacher',
      name: '老师',
      scope: RoleScope.ORGANIZATION,
      permissions: ['organization:read', 'class:read'],
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: {
      username: adminUsername,
      passwordHash: adminPasswordHash,
      userType: UserType.ADMIN,
      approvalStatus: UserApprovalStatus.APPROVED,
      isPlatformAdmin: true,
    },
    create: {
      username: adminUsername,
      email: adminEmail.toLowerCase(),
      passwordHash: adminPasswordHash,
      displayName: '平台管理员',
      userType: UserType.ADMIN,
      approvalStatus: UserApprovalStatus.APPROVED,
      isPlatformAdmin: true,
    },
  });

  if (process.env.SEED_DEMO_DATA !== 'true') {
    console.log('Seed completed');
    console.log(`Admin: ${adminEmail} / ${adminPassword}`);
    return;
  }

  const demoSchool = await prisma.organization.upsert({
    where: { code: 'demo-school' },
    update: {},
    create: {
      name: '示例学校',
      code: 'demo-school',
    },
  });

  const demoClass = await prisma.class.upsert({
    where: {
      organizationId_code: {
        organizationId: demoSchool.id,
        code: 'grade1-class1',
      },
    },
    update: {},
    create: {
      organizationId: demoSchool.id,
      name: '一年级 1 班',
      code: 'grade1-class1',
    },
  });

  await prisma.userOrganization.upsert({
    where: {
      userId_organizationId: {
        userId: admin.id,
        organizationId: demoSchool.id,
      },
    },
    update: {
      roleId: platformAdminRole.id,
    },
    create: {
      userId: admin.id,
      organizationId: demoSchool.id,
      roleId: platformAdminRole.id,
    },
  });

  await prisma.userClass.upsert({
    where: {
      userId_classId: {
        userId: admin.id,
        classId: demoClass.id,
      },
    },
    update: {
      role: 'TEACHER',
    },
    create: {
      userId: admin.id,
      classId: demoClass.id,
      role: 'TEACHER',
    },
  });

  const demoTeacher = await prisma.user.upsert({
    where: { email: 'teacher@example.com' },
    update: {
      passwordHash: demoPasswordHash,
      userType: UserType.TEACHER,
      approvalStatus: UserApprovalStatus.APPROVED,
      displayName: '示例教师',
    },
    create: {
      email: 'teacher@example.com',
      passwordHash: demoPasswordHash,
      displayName: '示例教师',
      userType: UserType.TEACHER,
      approvalStatus: UserApprovalStatus.APPROVED,
    },
  });

  const demoStudent = await prisma.user.upsert({
    where: { email: 'student@example.com' },
    update: {
      passwordHash: demoPasswordHash,
      userType: UserType.STUDENT,
      approvalStatus: UserApprovalStatus.APPROVED,
      displayName: '示例学生',
      ageBand: '6-12岁',
    },
    create: {
      email: 'student@example.com',
      passwordHash: demoPasswordHash,
      displayName: '示例学生',
      userType: UserType.STUDENT,
      approvalStatus: UserApprovalStatus.APPROVED,
      ageBand: '6-12岁',
    },
  });

  await prisma.userOrganization.upsert({
    where: {
      userId_organizationId: {
        userId: demoTeacher.id,
        organizationId: demoSchool.id,
      },
    },
    update: {
      roleId: teacherRole.id,
    },
    create: {
      userId: demoTeacher.id,
      organizationId: demoSchool.id,
      roleId: teacherRole.id,
    },
  });

  await prisma.userClass.upsert({
    where: {
      userId_classId: {
        userId: demoTeacher.id,
        classId: demoClass.id,
      },
    },
    update: { role: ClassMemberRole.TEACHER },
    create: {
      userId: demoTeacher.id,
      classId: demoClass.id,
      role: ClassMemberRole.TEACHER,
    },
  });

  await prisma.userClass.upsert({
    where: {
      userId_classId: {
        userId: demoStudent.id,
        classId: demoClass.id,
      },
    },
    update: { role: ClassMemberRole.STUDENT },
    create: {
      userId: demoStudent.id,
      classId: demoClass.id,
      role: ClassMemberRole.STUDENT,
    },
  });

  const demoCourse = await prisma.course.upsert({
    where: { slug: 'can-machines-learn' },
    update: {
      title: '机器真的能学习吗？',
      description: '面向儿童教育场景的机器学习启蒙课程。',
      runtimeType: CourseRuntimeType.STATIC,
      entryUrl: `${process.env.AGENT_PUBLIC_URL?.replace(/\/$/, '') ?? 'http://agent.docpine.online'}/can-machines-learn/`,
      status: CourseStatus.PUBLISHED,
      ownerType: CourseOwnerType.ADMIN,
      createdByUserId: admin.id,
    },
    create: {
      slug: 'can-machines-learn',
      title: '机器真的能学习吗？',
      description: '面向儿童教育场景的机器学习启蒙课程。',
      runtimeType: CourseRuntimeType.STATIC,
      entryUrl: `${process.env.AGENT_PUBLIC_URL?.replace(/\/$/, '') ?? 'http://agent.docpine.online'}/can-machines-learn/`,
      status: CourseStatus.PUBLISHED,
      ownerType: CourseOwnerType.ADMIN,
      createdByUserId: admin.id,
    },
  });

  const demoCourseware = await prisma.courseware.upsert({
    where: {
      courseId_slug: {
        courseId: demoCourse.id,
        slug: 'intro',
      },
    },
    update: {
      title: '机器学习启蒙互动',
      description: '完成一次机器学习概念互动体验。',
      runtimeType: CourseRuntimeType.STATIC,
      entryUrl: `${process.env.AGENT_PUBLIC_URL?.replace(/\/$/, '') ?? 'http://agent.docpine.online'}/can-machines-learn/intro/`,
      status: CourseStatus.PUBLISHED,
      sortOrder: 10,
    },
    create: {
      courseId: demoCourse.id,
      slug: 'intro',
      title: '机器学习启蒙互动',
      description: '完成一次机器学习概念互动体验。',
      runtimeType: CourseRuntimeType.STATIC,
      entryUrl: `${process.env.AGENT_PUBLIC_URL?.replace(/\/$/, '') ?? 'http://agent.docpine.online'}/can-machines-learn/intro/`,
      status: CourseStatus.PUBLISHED,
      sortOrder: 10,
    },
  });

  await prisma.courseCourseware.upsert({
    where: {
      courseId_coursewareId: {
        courseId: demoCourse.id,
        coursewareId: demoCourseware.id,
      },
    },
    update: {
      sortOrder: 10,
    },
    create: {
      courseId: demoCourse.id,
      coursewareId: demoCourseware.id,
      sortOrder: 10,
    },
  });

  const existingDemoAssignment = await prisma.courseAssignment.findFirst({
    where: {
      courseId: demoCourse.id,
      classId: demoClass.id,
      teacherId: demoTeacher.id,
      title: '体验：机器真的能学习吗？',
    },
  });
  const demoAssignment = existingDemoAssignment ?? (await prisma.courseAssignment.create({
    data: {
      courseId: demoCourse.id,
      classId: demoClass.id,
      teacherId: demoTeacher.id,
      title: '体验：机器真的能学习吗？',
      instructions: '打开课件，完成一次互动学习。',
    },
  }));

  const existingLearningRecord = await prisma.learningRecord.findFirst({
    where: {
      courseId: demoCourse.id,
      coursewareId: demoCourseware.id,
      assignmentId: demoAssignment.id,
      classId: demoClass.id,
      studentId: demoStudent.id,
    },
  });
  if (!existingLearningRecord) {
    await prisma.learningRecord.create({
      data: {
        courseId: demoCourse.id,
        coursewareId: demoCourseware.id,
        assignmentId: demoAssignment.id,
        classId: demoClass.id,
        studentId: demoStudent.id,
        status: LearningRecordStatus.STARTED,
        startedAt: new Date(),
        summary: { source: 'seed' },
      },
    });
  }

  const demoApplication = await prisma.application.upsert({
    where: { appId: 'demo-teaching-app' },
    update: {
      appSecretHash: demoAppSecretHash,
      allowedOrigins: demoAllowedOrigins,
      redirectUris: demoRedirectUris,
    },
    create: {
      appId: 'demo-teaching-app',
      appSecretHash: demoAppSecretHash,
      name: '教学辅助演示应用',
      description: '用于验证统一登录和授权 code 换 token 流程',
      homeUrl: 'http://localhost:3001',
      allowedOrigins: demoAllowedOrigins,
      redirectUris: demoRedirectUris,
    },
  });

  const mandarinApplication = await prisma.application.upsert({
    where: { appId: 'mandarin-practice-app' },
    update: {
      appSecretHash: mandarinAppSecretHash,
      allowedOrigins: ['http://localhost:3101'],
      redirectUris: ['http://localhost:3101/auth/callback'],
    },
    create: {
      appId: 'mandarin-practice-app',
      appSecretHash: mandarinAppSecretHash,
      name: '普通话练习第三方测试应用',
      description: '独立业务数据，通过业务底座统一登录读取平台用户上下文',
      homeUrl: 'http://localhost:3101',
      allowedOrigins: ['http://localhost:3101'],
      redirectUris: ['http://localhost:3101/auth/callback'],
    },
  });

  for (const application of [demoApplication, mandarinApplication]) {
    await prisma.applicationOrganizationAccess.upsert({
      where: {
        applicationId_organizationId: {
          applicationId: application.id,
          organizationId: demoSchool.id,
        },
      },
      update: {},
      create: {
        applicationId: application.id,
        organizationId: demoSchool.id,
      },
    });
  }

  await prisma.role.upsert({
    where: { key: teacherRole.key },
    update: {},
    create: {
      key: teacherRole.key,
      name: teacherRole.name,
      scope: teacherRole.scope,
      permissions: teacherRole.permissions,
    },
  });

  console.log('Seed completed');
  console.log(`Admin: ${adminEmail} / ${adminPassword}`);
  console.log(`Demo app: demo-teaching-app / ${demoAppSecret}`);
  console.log(`Mandarin app: mandarin-practice-app / ${mandarinAppSecret}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
