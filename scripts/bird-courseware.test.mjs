import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import runtimeModule from '../platform/api/dist/modules/course-runtime/course-runtime.service.js';
import coursesModule from '../platform/api/dist/modules/courses/courses.service.js';
import { createLaunchGuard } from '../coursewares/birdai/server/launch-guard.js';
import { validateCatalog } from './courseware-release.mjs';

const { CourseRuntimeService } = runtimeModule;
const { CoursesService } = coursesModule;
const root = path.resolve(import.meta.dirname, '..');
test('all three incoming packages pass the same release validator', async () => {
  const { coursewares } = await validateCatalog({ repoRoot: root, catalogFile: 'coursewares/incoming-birds.json' });
  assert.equal(coursewares.length, 3); assert.ok(coursewares.every(item => item.manifest.entry === '/'));
});
test('all bundled bird recordings contain audio rather than error pages', async () => {
  const audioDir = path.join(root, 'coursewares/birdai/static/assets/audio');
  const files = await readdir(audioDir);
  assert.equal(files.length, 11);
  for (const file of files) {
    const audio = await readFile(path.join(audioDir, file));
    assert.ok(audio.subarray(0, 3).toString() === 'ID3' || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0), file);
    assert.doesNotMatch(audio.subarray(0, 512).toString(), /<!doctype|<html/i, file);
  }
});
function recordFixture(status = 'COMPLETED') {
  let row = { id: 'record', status, score: 86, summary: { artifacts: [{ url: '/saved' }] }, completedAt: new Date() };
  let race = false;
  const fake = {
    prisma: {
      courseAssignment: { findFirst: async () => ({ id: 'assignment', courseId: 'course', classId: 'class', status: 'ACTIVE', teachingStatus: 'OPEN' }) },
      learningRecord: {
        findFirst: async () => ({ ...row }),
        findUniqueOrThrow: async () => row,
        update: async ({ data }) => (row = { ...row, ...data }),
        updateMany: async ({ where, data }) => {
          if (race) row.status = 'COMPLETED';
          if (row.status === where.status.not) return { count: 0 };
          row = { ...row, ...data }; return { count: 1 };
        },
      },
    },
    findPublishedCourseware: async () => ({ id: 'ware', course: { id: 'course' } }),
    ensureAssignmentCoursewareOpen: async () => {}, ensureStudentInClass: async () => {},
    includeRelations: () => ({}), toRecord: (record) => record,
  };
  return { fake, setRace: () => { race = true; } };
}
for (const status of ['STARTED', 'PROGRESS']) test(`late ${status} preserves submitted work`, async () => {
  const { fake } = recordFixture();
  const row = await CourseRuntimeService.prototype.upsertStudentRecord.call(fake, 'student', { assignmentId: 'assignment', status, score: 0, summary: {} });
  assert.equal(row.status, 'COMPLETED'); assert.equal(row.score, 86); assert.equal(row.summary.artifacts[0].url, '/saved');
});
test('atomic status filter protects a concurrent completion', async () => {
  const { fake, setRace } = recordFixture('STARTED'); setRace();
  const row = await CourseRuntimeService.prototype.upsertStudentRecord.call(fake, 'student', { assignmentId: 'assignment', status: 'PROGRESS', summary: {} });
  assert.equal(row.status, 'COMPLETED'); assert.ok(row.summary.artifacts);
});
test('normal progress still works and null clears an old score', async () => {
  const { fake } = recordFixture('STARTED');
  const progress = await CourseRuntimeService.prototype.upsertStudentRecord.call(fake, 'student', { assignmentId: 'assignment', status: 'PROGRESS' });
  assert.equal(progress.status, 'PROGRESS');
  const complete = await CourseRuntimeService.prototype.upsertStudentRecord.call(fake, 'student', { assignmentId: 'assignment', status: 'COMPLETED', score: null });
  assert.equal(complete.status, 'COMPLETED'); assert.equal(complete.score, null);
});
test('completed records do not bypass a closed assignment', async () => {
  const { fake } = recordFixture();
  fake.prisma.courseAssignment.findFirst = async () => ({ courseId: 'course', status: 'ACTIVE', teachingStatus: 'ENDED' });
  await assert.rejects(CourseRuntimeService.prototype.upsertStudentRecord.call(fake, 'student', { assignmentId: 'assignment', status: 'PROGRESS' }), /not open/);
});
test('report MIME is accepted by the actual platform whitelist', () => {
  assert.equal(CourseRuntimeService.prototype.isAllowedArtifactMime('text/plain'), true);
  assert.equal(CourseRuntimeService.prototype.isAllowedArtifactMime('application/json'), true);
  assert.equal(CourseRuntimeService.prototype.isAllowedArtifactMime('image/jpeg'), true);
});
test('systemd passes only the named bird provider configuration', () => {
  const content = CoursesService.prototype.systemdEnvContent({
    DONGNIAO_API_KEY: 'unit-test-placeholder',
    DONGNIAO_ENDPOINT: 'https://provider.invalid/api',
    DONGNIAO_DEVICE_ID: 'unit-test-device',
    UNRELATED_SECRET: 'must-not-be-exported',
  });
  assert.match(content, /DONGNIAO_API_KEY="unit-test-placeholder"/);
  assert.match(content, /DONGNIAO_ENDPOINT="https:\/\/provider\.invalid\/api"/);
  assert.match(content, /DONGNIAO_DEVICE_ID="unit-test-device"/);
  assert.doesNotMatch(content, /UNRELATED_SECRET|must-not-be-exported/);
});

for (const slug of ['birdai', 'yolo-environment-recognition']) test(`${slug}: verify, artifact retry, null score, no late progress`, async () => {
  const calls = []; let failSecondArtifact = true, failCompletion = true;
  const sandbox = { URL, URLSearchParams, AbortController, structuredClone, setTimeout, clearTimeout, Date, Promise,
    location: { search: '?launchToken=unit-test&platformApiBase=http://platform.invalid/api/v1' },
    document: { title: slug, documentElement: { dataset: {} } }, window: {},
    fetch: async (url, options) => {
      const body = JSON.parse(options.body); calls.push({ url, body });
      if (url.endsWith('/verify')) return { ok: true, json: async () => ({ context: {} }) };
      if (url.endsWith('/artifacts')) {
        if (body.fileName === 'second.json' && failSecondArtifact) { failSecondArtifact = false; return { ok: false, status: 503, json: async () => ({}) }; }
        return { ok: true, json: async () => ({ url: `/${body.fileName}`, mimeType: body.mimeType }) };
      }
      if (body.status === 'COMPLETED' && failCompletion) { failCompletion = false; return { ok: false, status: 503, json: async () => ({}) }; }
      return { ok: true, json: async () => ({}) };
    },
  };
  vm.runInNewContext(await readFile(path.join(root, 'coursewares', slug, 'static/platform-client.js'), 'utf8'), sandbox);
  const client = sandbox.window.ZhikeCourseware; await client.initialize();
  assert.ok(calls[0].url.endsWith('/verify')); assert.equal(calls[1].body.status, 'STARTED');
  const work = { score: null, brief: 'original', pendingArtifacts: ['first.json', 'second.json'].map((fileName) => ({ localId: fileName, fileName, mimeType: 'application/json', contentBase64: 'e30=' })) };
  await assert.rejects(client.complete(work));
  work.brief = 'edited'; await assert.rejects(client.complete(work));
  await client.complete(work); await client.progress('after submission'); await client.complete(work);
  assert.equal(calls.filter((call) => call.body.fileName === 'first.json').length, 1);
  assert.equal(calls.filter((call) => call.body.fileName === 'second.json').length, 2);
  const completions = calls.filter((call) => call.body.status === 'COMPLETED');
  assert.equal(completions.length, 2);
  assert.equal(completions[1].body.score, null); assert.equal(completions[1].body.summary.brief, 'original');
  assert.equal(completions[1].body.summary.artifacts.length, 2);
  assert.equal(calls.filter((call) => call.body.status === 'PROGRESS').length, 0);
});
test('paid recognition guard rejects missing, expired, wrong-course and readonly launch tokens', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const guard = createLaunchGuard({ PLATFORM_API_BASE_URL: 'http://platform.invalid/api/v1', COURSE_SLUG: 'course', COURSEWARE_SLUG: 'birdai' });
    for (const mode of ['missing', 'expired', 'wrong-course', 'readonly', 'valid']) {
      globalThis.fetch = async () => ({ ok: mode !== 'expired', status: 403, json: async () => ({ context: {
        student: { id: 'student', readOnlyPreview: mode === 'readonly' }, course: { slug: mode === 'wrong-course' ? 'other' : 'course' }, courseware: { slug: 'birdai' },
      } }) });
      let code, next = false;
      const response = { status: (value) => { code = value; return response; }, json: () => {} };
      const request = { headers: mode === 'missing' ? {} : { 'x-course-launch': 'unit-test' } };
      await guard(request, response, () => { next = true; });
      assert.equal(next, mode === 'valid');
      if (mode !== 'valid') assert.equal(code, mode === 'missing' ? 401 : 403);
      else assert.match(request.learnerKey, /^[a-f0-9]{64}$/);
    }
  } finally { globalThis.fetch = originalFetch; }
});
