import { PrismaClient, RoleScope } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminUsername = process.env.ADMIN_USERNAME ?? 'admin';
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';
  const demoAppSecret = process.env.DEMO_APP_SECRET ?? 'demo-app-secret';

  const adminPasswordHash = await bcrypt.hash(adminPassword, 12);
  const demoAppSecretHash = await bcrypt.hash(demoAppSecret, 12);

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
      isPlatformAdmin: true,
    },
    create: {
      username: adminUsername,
      email: adminEmail.toLowerCase(),
      passwordHash: adminPasswordHash,
      displayName: '平台管理员',
      isPlatformAdmin: true,
    },
  });

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

  await prisma.application.upsert({
    where: { appId: 'demo-teaching-app' },
    update: {
      appSecretHash: demoAppSecretHash,
      allowedOrigins: ['http://localhost:3001'],
      redirectUris: ['http://localhost:3001/auth/callback'],
    },
    create: {
      appId: 'demo-teaching-app',
      appSecretHash: demoAppSecretHash,
      name: '教学辅助演示应用',
      description: '用于验证统一登录和授权 code 换 token 流程',
      homeUrl: 'http://localhost:3001',
      allowedOrigins: ['http://localhost:3001'],
      redirectUris: ['http://localhost:3001/auth/callback'],
    },
  });

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
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
