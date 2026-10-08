const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const { ConfigService } = require('@nestjs/config');
const { CourseRuntimeService } = require('../platform/api/dist/modules/course-runtime/course-runtime.service.js');
const root = path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:3301', courseSlug = 'local-bird-integration-acceptance';
let prisma, api, course, log;
async function request(route, method = 'GET', body, token, expected = 200) {
  const response = await fetch(base + route, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({}));
  assert.ok(response.status === expected || (expected === 200 && response.status === 201), `${method} ${route}: HTTP ${response.status}`);
  return data;
}
async function main() {
  const config = dotenv.parse(await fs.readFile(process.env.ZHIKE_LOCAL_ENV_FILE || path.join(root, 'platform/api/.env')));
  const database = new URL(config.DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(database.hostname) || database.port !== '55432') throw new Error('Only the local acceptance database on port 55432 is allowed');
  const portCheck = net.createServer(); await new Promise((resolve, reject) => { portCheck.once('error', reject); portCheck.listen(3301, '127.0.0.1', resolve); }); await new Promise(resolve => portCheck.close(resolve));
  const output = path.join(root, 'output/bird-courseware-acceptance'); await fs.mkdir(output, { recursive: true, mode: 0o700 });
  const runtime = path.join(output, 'runtime'), artifactRoot = path.join(output, 'artifacts');
  prisma = new PrismaClient({ datasources: { db: { url: config.DATABASE_URL } } });
  if (await prisma.course.findUnique({ where: { slug: courseSlug } })) throw new Error('Acceptance course already exists; inspect it before retrying');
  const accounts = JSON.parse(await fs.readFile(path.join(os.homedir(), '.zhike-agent-secrets/local-development/accounts.json')));
  const teacherAccount = accounts.accounts.find(account => account.userType === 'TEACHER');
  const studentAccount = accounts.accounts.find(account => account.userType === 'STUDENT');
  const teacher = await prisma.user.findFirstOrThrow({ where: { username: teacherAccount.username } });
  course = await prisma.course.create({ data: { slug: courseSlug, title: '三个观鸟课件本地验收', entryUrl: `/${courseSlug}/`, status: 'PUBLISHED', manifestValid: true } });
  const assignment = await prisma.courseAssignment.create({ data: { courseId: course.id, classId: accounts.classId, teacherId: teacher.id, title: '本地修复验收', status: 'ACTIVE', teachingStatus: 'OPEN' } });
  const manifests = [];
  for (const slug of ['yolo-environment-recognition', 'birdai', 'bird-migration-lab']) {
    const source = path.join(root, 'coursewares', slug);
    const manifest = JSON.parse(await fs.readFile(path.join(source, 'manifest.json')));
    await fs.cp(path.join(source, 'static'), path.join(runtime, courseSlug, 'coursewares', slug, 'static'), { recursive: true });
    const ware = await prisma.courseware.create({ data: { courseId: course.id, slug, title: manifest.title, runtimeType: manifest.runtimeType, entryUrl: `/${courseSlug}/${slug}/`, manifest, manifestValid: true, status: 'PUBLISHED', deploymentStatus: 'RUNNING' } });
    await prisma.courseCourseware.create({ data: { courseId: course.id, coursewareId: ware.id } });
    await prisma.courseAssignmentCoursewareState.create({ data: { assignmentId: assignment.id, coursewareId: ware.id, status: 'OPEN' } });
    manifests.push({ manifest, ware });
  }
  const env = { ...process.env, ...config, PORT: '3301', HOST: '127.0.0.1', AGENT_PUBLIC_URL: base, PLATFORM_PUBLIC_URL: base, PLATFORM_API_BASE_URL: `${base}/api/v1`, API_PUBLIC_URL: base, COURSE_RUNTIME_ROOT: runtime, LEARNING_ARTIFACT_ROOT: artifactRoot };
  log = await fs.open(path.join(output, 'api.log'), 'a', 0o600);
  api = spawn(process.execPath, [path.join(root, 'platform/api/dist/main.js')], { cwd: path.join(root, 'platform/api'), env, stdio: ['ignore', log.fd, log.fd] });
  api.on('error', error => console.error(`Local API process: ${error.code}`));
  let healthy = false;
  for (let i = 0; i < 240; i++) { if (api.exitCode !== null || api.signalCode !== null) break; healthy = await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) }).then(response => response.ok, () => false); if (healthy) break; await new Promise(resolve => setTimeout(resolve, 500)); }
  assert.ok(healthy, 'Isolated API did not start');
  const sessions = {};
  for (const account of [teacherAccount, studentAccount]) sessions[account.userType] = (await request('/api/v1/auth/login', 'POST', { usernameOrEmail: account.username, password: account.password })).accessToken;
  let firstLaunch, firstId, lastLaunch; const result = [];
  for (const { manifest, ware } of manifests) {
    const launch = await request('/api/v1/course-runtime/launch', 'POST', { courseSlug, coursewareSlug: manifest.slug, assignmentId: assignment.id, classId: accounts.classId }, sessions.STUDENT);
    await request('/api/v1/course-runtime/launch/verify', 'POST', { launchToken: launch.launchToken });
    firstLaunch ||= launch.launchToken; firstId ||= launch.context.launchSessionId;
    lastLaunch = launch.launchToken;
    const entry = await fetch(launch.launchUrl); assert.equal(entry.status, 200); const html = await entry.text(); assert.match(html, /<!doctype html>/i);
    for (const [, asset] of html.matchAll(/<(?:script|link)[^>]*(?:src|href)=["']([^"']+)["']/g)) {
      const url = new URL(asset, launch.launchUrl); if (url.origin !== base) continue;
      const response = await fetch(url); assert.equal(response.status, 200); assert.ok(!response.headers.get('content-type')?.includes('text/html'), `Asset incorrectly fell back to HTML: ${url.pathname}`);
    }
    const mimeType = manifest.slug === 'bird-migration-lab' ? 'text/plain' : 'application/json';
    const artifact = await request('/api/v1/course-runtime/launch/artifacts', 'POST', { launchToken: launch.launchToken, fileName: mimeType === 'text/plain' ? 'acceptance-report.txt' : 'acceptance-report.json', mimeType, kind: 'report', contentBase64: Buffer.from(mimeType === 'text/plain' ? 'local acceptance report' : '{"evaluation":"pending"}').toString('base64') });
    const score = manifest.slug === 'bird-migration-lab' ? 80 : null;
    const record = await request('/api/v1/course-runtime/launch/records', 'POST', { launchToken: launch.launchToken, status: 'COMPLETED', score, summary: { displayTitle: manifest.title, scoreText: score === null ? '未评分' : '80 分', artifacts: [{ url: artifact.url, mimeType }] } });
    assert.equal(record.score, score);
    const late = await request('/api/v1/course-runtime/launch/records', 'POST', { launchToken: launch.launchToken, status: 'PROGRESS', score: 0, summary: {} });
    assert.equal(late.status, 'COMPLETED'); assert.equal(late.score, score); assert.equal(late.summary.artifacts.length, 1);
    const teacherRecords = await request(`/api/v1/portal/teacher/learning-records?assignmentId=${assignment.id}&coursewareId=${ware.id}`, 'GET', undefined, sessions.TEACHER);
    assert.equal(teacherRecords.records[0].score, score); assert.equal(teacherRecords.records[0].status, 'COMPLETED');
    const file = await fetch(new URL(artifact.url, base)); assert.equal(file.status, 200); assert.ok((await file.arrayBuffer()).byteLength > 0);
    result.push({ slug: manifest.slug, launch: true, assets: true, upload: true, score, lateProgressProtected: true, teacherRead: true, artifactDownload: true });
  }
  const readonly = new CourseRuntimeService(prisma, new ConfigService({ READ_ONLY_PREVIEW_USERS: studentAccount.username }), {});
  await assert.rejects(readonly.verifyLaunch(firstLaunch), /只读/);
  await prisma.courseLaunchSession.update({ where: { id: firstId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await request('/api/v1/course-runtime/launch/verify', 'POST', { launchToken: firstLaunch }, undefined, 403);
  await prisma.courseAssignment.update({ where: { id: assignment.id }, data: { teachingStatus: 'ENDED' } });
  await request('/api/v1/course-runtime/launch/verify', 'POST', { launchToken: lastLaunch }, undefined, 403);
  console.log(JSON.stringify({ database: 'local-only', result, expiredLaunchRejected: true, readonlyOldLaunchRejected: true, closedAssignmentRejected: true }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (api) { api.kill('SIGTERM'); await new Promise(resolve => { api.once('exit', resolve); setTimeout(resolve, 5000); }); }
  if (log) await log.close();
  if (course) await prisma.course.delete({ where: { id: course.id } });
  if (prisma) await prisma.$disconnect();
});
