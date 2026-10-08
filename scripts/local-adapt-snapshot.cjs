const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, 'platform/api/.env'), quiet: true });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '55432') {
  throw new Error('This operation is restricted to local PostgreSQL port 55432.');
}
const prisma = new PrismaClient();
async function main() {
  const artifactRoot = process.env.LEARNING_ARTIFACT_ROOT;
  if (!artifactRoot || !path.isAbsolute(artifactRoot)) throw new Error('Set an absolute local artifact root');
  for (const model of ['course', 'courseware']) {
    for (const row of await prisma[model].findMany()) {
      if (!row.entryUrl.includes('.docpine.online')) continue;
      const entry = new URL(row.entryUrl);
      await prisma[model].update({ where: { id: row.id }, data: { entryUrl: `http://localhost:3000${entry.pathname}${entry.search}` } });
    }
  }
  const artifacts = await prisma.learningRecordArtifact.findMany();
  let missing = 0;
  for (const row of artifacts) {
    const marker = '/learning-artifacts/';
    const index = row.storagePath.indexOf(marker);
    if (index < 0) throw new Error(`Unexpected artifact path for ${row.id}`);
    const localPath = path.join(artifactRoot, row.storagePath.slice(index + marker.length));
    const access = await fs.access(localPath).then(() => true, () => false);
    if (!access) missing += 1;
    let publicUrl = row.publicUrl;
    if (/^https?:/.test(publicUrl)) publicUrl = `http://localhost:3000${new URL(publicUrl).pathname}`;
    await prisma.learningRecordArtifact.update({ where: { id: row.id }, data: { storagePath: localPath, publicUrl } });
  }
  const privateDir = path.join(os.homedir(), '.zhike-agent-secrets/local-development');
  await fs.mkdir(privateDir, { recursive: true, mode: 0o700 });
  const accounts = [];
  for (const userType of ['ADMIN', 'TEACHER', 'STUDENT']) {
    const username = `local_${userType.toLowerCase()}`;
    const password = crypto.randomBytes(24).toString('base64url');
    const user = await prisma.user.upsert({
      where: { username },
      create: { username, email: `${username}@localhost.invalid`, passwordHash: await bcrypt.hash(password, 12), displayName: `本地开发${userType}`, userType, isPlatformAdmin: userType === 'ADMIN' },
      update: { passwordHash: await bcrypt.hash(password, 12), status: 'ACTIVE', approvalStatus: 'APPROVED' },
    });
    accounts.push({ username, password, id: user.id, userType });
  }
  const organization = await prisma.organization.upsert({ where: { code: 'LOCAL_DEV' }, create: { code: 'LOCAL_DEV', name: '本地开发学校' }, update: {} });
  const classroom = await prisma.class.upsert({ where: { organizationId_code: { organizationId: organization.id, code: 'LOCAL_DEV' } }, create: { organizationId: organization.id, code: 'LOCAL_DEV', name: '本地测试班' }, update: {} });
  for (const user of accounts.filter((item) => item.userType !== 'ADMIN')) {
    await prisma.userOrganization.upsert({ where: { userId_organizationId: { userId: user.id, organizationId: organization.id } }, create: { userId: user.id, organizationId: organization.id }, update: {} });
    await prisma.userClass.upsert({ where: { userId_classId: { userId: user.id, classId: classroom.id } }, create: { userId: user.id, classId: classroom.id, role: user.userType }, update: {} });
  }
  const course = await prisma.course.findUniqueOrThrow({ where: { slug: 'can-machines-learn' } });
  const teacher = accounts.find((item) => item.userType === 'TEACHER');
  let assignment = await prisma.courseAssignment.findFirst({ where: { courseId: course.id, classId: classroom.id } });
  if (!assignment) assignment = await prisma.courseAssignment.create({ data: { courseId: course.id, classId: classroom.id, teacherId: teacher.id, title: '本地验收课程', teachingStatus: 'OPEN' } });
  for (const ware of await prisma.courseware.findMany({ where: { courseId: course.id, deletedAt: null, status: 'PUBLISHED' } })) {
    await prisma.courseCourseware.upsert({ where: { courseId_coursewareId: { courseId: course.id, coursewareId: ware.id } }, create: { courseId: course.id, coursewareId: ware.id, sortOrder: ware.sortOrder }, update: {} });
    await prisma.courseAssignmentCoursewareState.upsert({ where: { assignmentId_coursewareId: { assignmentId: assignment.id, coursewareId: ware.id } }, create: { assignmentId: assignment.id, coursewareId: ware.id, status: 'OPEN' }, update: { status: 'OPEN' } });
  }
  // Imported production integrations stay disabled until configured for localhost.
  await prisma.application.updateMany({ data: { status: 'DISABLED' } });
  await prisma.refreshToken.deleteMany();
  await prisma.authorizationCode.deleteMany();
  await prisma.courseLaunchSession.deleteMany();
  await fs.writeFile(path.join(privateDir, 'accounts.json'), JSON.stringify({ url: 'http://localhost:5173', accounts, assignmentId: assignment.id, classId: classroom.id, note: 'LOCAL ONLY. Never use these accounts or this configuration in production.' }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ artifacts: artifacts.length, missingArtifacts: missing, localAccounts: accounts.length, productionApplicationsDisabled: true }));
  if (missing) throw new Error('Snapshot has missing artifact files; inspect before claiming complete.');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
