const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, 'platform/api/.env'), quiet: true });
const database = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(database.hostname) || database.port !== '55432') throw new Error('Local database required');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const base = 'http://127.0.0.1:3000';
async function request(route, method = 'GET', body, token) {
  const response = await fetch(`${base}${route}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`${method} ${route}: HTTP ${response.status}`);
  return response.json();
}
async function main() {
  const credentials = JSON.parse(await fs.readFile(path.join(os.homedir(), '.zhike-agent-secrets/local-development/accounts.json')));
  assert.equal((await request('/api/health')).status, 'ok');
  const sessions = {};
  for (const account of credentials.accounts) {
    const login = await request('/api/v1/auth/login', 'POST', { usernameOrEmail: account.username, password: account.password });
    assert.equal(login.user.userType, account.userType);
    sessions[account.userType] = login.accessToken;
    await request('/api/v1/auth/me', 'GET', undefined, login.accessToken);
    const refreshed = await request('/api/v1/auth/refresh', 'POST', { refreshToken: login.refreshToken });
    assert.ok(refreshed.accessToken);
  }
  await request('/api/v1/courses', 'GET', undefined, sessions.ADMIN);
  await request('/api/v1/portal/teacher/assignments', 'GET', undefined, sessions.TEACHER);
  await request('/api/v1/portal/student/assignments', 'GET', undefined, sessions.STUDENT);
  const mapping = JSON.parse(await fs.readFile(path.join(root, 'ops/courseware-deployments.json')));
  for (const ware of mapping.coursewares) {
    const launch = await request('/api/v1/course-runtime/launch', 'POST', { courseSlug: mapping.courseSlug, coursewareSlug: ware.runtimeSlug, assignmentId: credentials.assignmentId, classId: credentials.classId }, sessions.STUDENT);
    const launchUrl = new URL(launch.launchUrl);
    assert.equal(launchUrl.hostname, 'localhost');
    const page = await fetch(launchUrl);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<!doctype html>/i);
    await request('/api/v1/course-runtime/launch/verify', 'POST', { launchToken: launch.launchToken });
    const record = await request('/api/v1/course-runtime/launch/records', 'POST', { launchToken: launch.launchToken, status: 'COMPLETED', score: 100, durationSeconds: 1, summary: { source: 'local-baseline-acceptance' } });
    assert.equal(record.score, 100);
    assert.equal(record.status, 'COMPLETED');
  }
  const four = await request('/can-machines-learn/four-panel-story-studio/api/health');
  assert.equal(four.ok, true);
  assert.equal(four.arkConfigured, false);
  const quick = await fetch('http://127.0.0.1:4108/health');
  assert.equal(quick.status, 200);
  let checkedArtifacts = 0;
  for (const artifact of await prisma.learningRecordArtifact.findMany()) {
    await fs.access(artifact.storagePath);
    checkedArtifacts += 1;
  }
  const artifact = await prisma.learningRecordArtifact.findFirst();
  if (artifact) {
    const response = await fetch(`${base}/api/v1/course-runtime/artifacts/${artifact.id}/file`);
    assert.equal(response.status, 200);
    assert.equal((await response.arrayBuffer()).byteLength, artifact.sizeBytes);
  }
  console.log(JSON.stringify({ rolesLoggedIn: 3, refreshPassed: 3, coursewareLaunchVerifySavePassed: 7, artifactsPresent: checkedArtifacts, artifactDownloadPassed: Boolean(artifact), nodeServicesHealthy: 2, paidAiDisabledLocally: true }));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
