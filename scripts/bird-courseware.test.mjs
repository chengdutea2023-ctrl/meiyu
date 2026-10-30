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
async function migrationMap() {
  const module = { exports: {} };
  vm.runInNewContext(await readFile(path.join(root, 'coursewares/bird-migration-lab/static/app.js'), 'utf8'), { module });
  return module.exports;
}
test('Pacific route fits its actual longitude span instead of spanning the entire world', async () => {
  const map = await migrationMap(), points = map.pointObjects(map.presets.find(p => p.id === 'pacific'));
  const bounds = map.routeBounds(points), view = map.routeView(points);
  assert.ok(bounds.right - bounds.left < 70);
  assert.ok(bounds.left < 0 && bounds.right > 0);
  for (const point of points) {
    const [x, y] = map.project(point);
    const visibleX = [-1080, 0, 1080].map(offset => (x + offset) * view.zoom + view.tx).find(value => value >= 0 && value <= 1080);
    assert.ok(visibleX >= 60 && visibleX <= 1020, point.name);
    assert.ok(y * view.zoom + view.ty >= 50 && y * view.zoom + view.ty <= 490, point.name);
  }
  assert.ok(map.distance(points) > 11000 && map.distance(points) < 13000);
  assert.match(map.routePath(points), /M0,|M1080,/);
});
test('repeated map wraps horizontal drag at every zoom without changing vertical bounds', async () => {
  const map = await migrationMap();
  for (const zoom of [1, 1.5, 8, 10]) for (const tx of [-100000, -1080 * zoom, -40, 0, 40, 100000]) {
    const view = map.mapTransform({ zoom, tx, ty: 100 });
    assert.ok(view.tx >= -540 * zoom && view.tx < 540 * zoom);
    assert.ok(Math.abs((tx - view.tx) / (1080 * zoom) - Math.round((tx - view.tx) / (1080 * zoom))) < 1e-8);
    assert.equal(view.ty, 0);
    assert.equal(map.mapTransform({ zoom, tx, ty: -100000 }).ty, 540 - 540 * zoom);
  }
  assert.equal(map.mapTransform({ zoom: 1, tx: 100, ty: 0 }).tx, 100);
});
test('route fitting handles reverse crossings, repeated crossings, single points and ordinary presets', async () => {
  const map = await migrationMap();
  for (const longitudes of [[179, -179], [-179, 179], [179, -179, 178, -178]]) {
    const bounds = map.routeBounds(longitudes.map(lon => ({ lon, lat: 0 })));
    assert.ok(bounds.right - bounds.left <= 12.01);
  }
  for (const points of [...map.presets.map(map.pointObjects), [{ lon: 180, lat: 90 }], [{ lon: -180, lat: -90 }]]) {
    const view = map.routeView(points);
    assert.ok(Object.values(view).every(Number.isFinite));
    assert.ok(view.zoom >= 1 && view.zoom <= 8);
    assert.ok(view.ty <= 0 && view.ty >= 540 - 540 * view.zoom);
  }
});
test('bird teaching photos preserve the entire image instead of cropping identifying features', async () => {
  const css = await readFile(path.join(root, 'coursewares/birdai/static/styles.css'), 'utf8');
  for (const selector of ['.bird-spot img', '.species-card img']) {
    const block = css.slice(css.indexOf(`${selector} {`)).split('}')[0];
    assert.match(block, /object-fit:\s*contain\s*;/, selector);
    assert.doesNotMatch(block, /object-fit:\s*cover\s*;/, selector);
  }
  const frame = css.slice(css.indexOf('.bird-spot {')).split('}')[0];
  assert.match(frame, /aspect-ratio:\s*3\s*\/\s*2\s*;/);
  assert.doesNotMatch(frame, /(?:^|\s)height:\s*\d+px\s*;/);
});
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
    COURSEWARE_ID: 'unit-test-bird-id',
    DONGNIAO_API_KEY: 'unit-test-placeholder',
    DONGNIAO_ENDPOINT: 'https://provider.invalid/api',
    DONGNIAO_DEVICE_ID: 'unit-test-device',
    UNRELATED_SECRET: 'must-not-be-exported',
  });
  assert.match(content, /DONGNIAO_API_KEY="unit-test-placeholder"/);
  assert.match(content, /DONGNIAO_ENDPOINT="https:\/\/provider\.invalid\/api"/);
  assert.match(content, /DONGNIAO_DEVICE_ID="unit-test-device"/);
  assert.match(content, /COURSEWARE_ID="unit-test-bird-id"/);
  assert.doesNotMatch(content, /UNRELATED_SECRET|must-not-be-exported/);
});

test('runtime identity is assigned by the platform and cannot be overridden by saved or supplied env', () => {
  const fake = {
    isCoursewareTarget: target => Boolean(target.course),
    readCourseRuntimeEnv: () => ({ COURSEWARE_ID: 'untrusted-saved-id' }),
    platformPublicUrl: () => 'https://platform.invalid',
    agentPublicUrl: () => 'https://course.invalid',
    runtimeStateDir: () => '/tmp/unit-test-runtime',
  };
  const target = { id: 'bird-unique-id', slug: 'birdai', course: { slug: 'source-course' } };
  const env = CoursesService.prototype.nodeRuntimeEnv.call(fake, target, 4106, { COURSEWARE_ID: 'untrusted-request-id' });
  assert.equal(env.COURSEWARE_ID, target.id);
  assert.equal(env.COURSE_SLUG, 'source-course');
  const legacyCourse = CoursesService.prototype.nodeRuntimeEnv.call(fake, { id: 'course-id', slug: 'legacy' }, 4106, {});
  assert.equal(legacyCourse.COURSEWARE_ID, '');
});

for (const slug of ['birdai', 'yolo-environment-recognition']) test(`${slug}: verify, artifact retry, null score, no late progress`, async () => {
  const calls = []; let failSecondArtifact = true, failCompletion = true;
  const sandbox = { URL, URLSearchParams, AbortController, structuredClone, setTimeout, clearTimeout, Date, Promise,
    location: { search: '?launchToken=unit-test&platformApiBase=http://platform.invalid/api/v1' },
    document: { title: slug, documentElement: { dataset: {} } }, window: { addEventListener() {} },
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
test('legacy recognition configuration keeps strict source-course validation', async () => {
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

for (const mode of ['original', 'linked', 'wrong-id', 'missing-id', 'wrong-slug', 'readonly', 'readonly-student', 'missing-student', 'expired', 'closed', 'unavailable']) {
  test(`ID-bound recognition authorization: ${mode}`, async () => {
    const originalFetch = globalThis.fetch;
    try {
      const guard = createLaunchGuard({ PLATFORM_API_BASE_URL: 'http://platform.invalid/api/v1', COURSE_SLUG: 'source', COURSEWARE_SLUG: 'birdai', COURSEWARE_ID: 'bird-unique-id' });
      globalThis.fetch = async () => {
        if (mode === 'unavailable') throw new Error('Platform unavailable');
        return { ok: !['expired', 'closed'].includes(mode), status: mode === 'expired' ? 401 : 403, json: async () => ({ context: {
          student: mode === 'missing-student' ? {} : { id: 'student', readOnlyPreview: mode === 'readonly-student' },
          readOnlyPreview: mode === 'readonly',
          course: { slug: mode === 'original' ? 'source' : 'linked-course' },
          courseware: { id: mode === 'missing-id' ? undefined : mode === 'wrong-id' ? 'another-bird-id' : 'bird-unique-id', slug: mode === 'wrong-slug' ? 'another-ware' : 'birdai' },
        } }) };
      };
      let code, next = false;
      const response = { status(value) { code = value; return this; }, json() {} };
      const request = { headers: { 'x-course-launch': 'isolated-validity-test' } };
      await guard(request, response, () => { next = true; });
      assert.equal(next, ['original', 'linked'].includes(mode));
      if (!next) assert.equal(code, mode === 'unavailable' ? 503 : mode === 'expired' ? 401 : 403);
      else assert.match(request.learnerKey, /^[a-f0-9]{64}$/);
    } finally { globalThis.fetch = originalFetch; }
  });
}

test('missing runtime identity fails closed without contacting the platform', async () => {
  const guard = createLaunchGuard({ PLATFORM_API_BASE_URL: 'http://platform.invalid/api/v1' });
  let code;
  const response = { status(value) { code = value; return this; }, json() {} };
  await guard({ headers: { 'x-course-launch': 'isolated-test' } }, response, () => assert.fail('must reject'));
  assert.equal(code, 503);
});

async function navigationFixture(slug, returnUrl = 'https://student.invalid/') {
  const calls = [], events = new Map(), elements = new Map(), navigations = [];
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { textContent: '', hidden: false, handlers: {},
      addEventListener(type, listener) { this.handlers[type] = listener; }, querySelectorAll() { return []; } });
    return elements.get(id);
  };
  let confirmed = false, confirmationCount = 0, holdCompletion;
  const location = { href: 'https://course.invalid/lesson/', search: `?launchToken=unit-test&platformApiBase=https://platform.invalid/api/v1&returnUrl=${encodeURIComponent(returnUrl)}`,
    assign: (url) => navigations.push(url) };
  const history = { length: 1, back: () => navigations.push('history') };
  const window = { location, history, addEventListener: (type, listener) => events.set(type, listener),
    setTimeout, clearTimeout, confirm: () => { confirmationCount++; return confirmed; } };
  const sandbox = { URL, URLSearchParams, AbortController, structuredClone, TextEncoder, btoa, setTimeout, clearTimeout, Date, Promise,
    location, history, window, document: { title: slug, documentElement: { dataset: {} }, getElementById: element },
    fetch: async (url, options) => {
      const body = JSON.parse(options.body); calls.push(body);
      if (body.status === 'COMPLETED' && holdCompletion) await holdCompletion;
      return { ok: true, json: async () => ({ context: { student: { id: 'student' }, assignment: { id: 'assignment' }, courseware: { id: 'ware' } }, url: '/saved-work' }) };
    },
  };
  const file = slug === 'bird-migration-lab' ? 'platform.js' : 'platform-client.js';
  vm.runInNewContext(await readFile(path.join(root, 'coursewares', slug, 'static', file), 'utf8'), sandbox);
  const client = window.ZhikeCourseware;
  await (client.initialize ? client.initialize() : client.ready());
  return { client, calls, events, elements, history, navigations, element,
    confirm: (answer) => { confirmed = answer; }, confirmations: () => confirmationCount,
    hold: (promise) => { holdCompletion = promise; },
    leave: () => client.returnToPortal ? client.returnToPortal() : element('returnPortal').handlers.click() };
}

for (const slug of ['birdai', 'yolo-environment-recognition', 'bird-migration-lab']) {
  test(`${slug}: unfinished return is confirmed and never completes work`, async () => {
    const fixture = await navigationFixture(slug); fixture.client.markDirty();
    fixture.leave(); assert.equal(fixture.navigations.length, 0); assert.equal(fixture.confirmations(), 1);
    fixture.confirm(true); fixture.leave(); assert.deepEqual(fixture.navigations, ['https://student.invalid/']);
    assert.equal(fixture.calls.filter((body) => body.status === 'COMPLETED').length, 0);
    let prevented = false;
    fixture.events.get('beforeunload')({ preventDefault: () => { prevented = true; } });
    assert.equal(prevented, false, 'confirmed return must not trigger a second unload dialog');
  });
  test(`${slug}: loading or invalid launch can still return without submitting`, async () => {
    const fixture = await navigationFixture(slug); fixture.leave();
    assert.deepEqual(fixture.navigations, ['https://student.invalid/']);
    assert.equal(fixture.confirmations(), 0);
  });
  test(`${slug}: unsafe or missing return URL cannot navigate`, async () => {
    for (const target of ['javascript:alert(1)', 'https://user:password@student.invalid/', '']) {
      const fixture = await navigationFixture(slug, target); fixture.leave();
      assert.equal(fixture.navigations.length, 0); assert.match(fixture.element('returnStatus').textContent, /缺少学生主页/);
    }
  });
  test(`${slug}: saving blocks return, saved work returns without a warning`, async () => {
    const fixture = await navigationFixture(slug); let release;
    fixture.hold(new Promise((resolve) => { release = resolve; }));
    const result = slug === 'bird-migration-lab'
      ? { points: [{ kind: 'wetland' }, { kind: 'forest' }], species: 'bird', season: 'autumn', reason: 'evidence', report: 'report', distanceKm: '10' }
      : { score: null, pendingArtifacts: [], brief: 'submitted' };
    const saving = fixture.client.complete(result);
    fixture.leave(); assert.equal(fixture.navigations.length, 0); assert.match(fixture.element('returnStatus').textContent, /正在保存/);
    release(); await saving; fixture.leave();
    assert.deepEqual(fixture.navigations, ['https://student.invalid/']); assert.equal(fixture.confirmations(), 0);
    assert.equal(fixture.calls.filter((body) => body.status === 'COMPLETED').length, 1);
  });
  test(`${slug}: return remains outside the lesson gate and visible in HTML`, async () => {
    const html = await readFile(path.join(root, 'coursewares', slug, 'static/index.html'), 'utf8');
    assert.equal((html.match(/id="returnPortal"/g) || []).length, 1);
    assert.match(html, /<nav[^>]*class="course-navigation"[\s\S]*?id="returnPortal"[^>]*>返回学生主页/);
    assert.doesNotMatch(html, /id="returnPortal"[^>]*hidden/);
  });
}

test('YOLO worker normalizes pixels, preserves coordinates, applies class-aware suppression and disposes outputs', async () => {
  const messages = [], feeds = [], runtime = { wasm: {} }; let disposed = 0, modelUrl;
  const output = { dims: [1, 84, 100], data: new Float32Array(84 * 100), dispose: () => disposed++ };
  for (const [index, label, probability] of [[0, 14, .9], [1, 14, .8], [2, 0, .7]]) {
    for (const [channel, value] of [[0, 320], [1, 320], [2, 100], [3, 100], [4 + label, probability]]) output.data[channel * 100 + index] = value;
  }
  const self = { location: { href: 'https://course.invalid/nested/lesson/inference-worker.js' }, postMessage: (data) => messages.push(data) };
  const sandbox = { self, URL, ArrayBuffer, Uint8ClampedArray, performance, importScripts() {}, ort: {
    env: runtime, Tensor: class { constructor(type, data, dims) { Object.assign(this, { type, data, dims }); } },
    InferenceSession: { create: async (url) => { modelUrl = url; return {
      inputNames: ['images'], outputNames: ['output'], run: async (feed) => { feeds.push(feed); return { output }; },
    }; } },
  } };
  vm.runInNewContext(await readFile(path.join(root, 'coursewares/yolo-environment-recognition/static/inference-worker.js'), 'utf8'), sandbox);
  await self.onmessage({ data: { id: 1, type: 'init' } }); assert.equal(messages.at(-1).ready, true);
  assert.equal(modelUrl, 'https://course.invalid/nested/lesson/models/yolov8n-int8.onnx');
  assert.equal(runtime.wasm.wasmPaths, 'https://course.invalid/nested/lesson/vendor/');
  const pixels = new Uint8ClampedArray(640 * 640 * 4); pixels[0] = 128; pixels[1] = 255;
  await self.onmessage({ data: { id: 2, type: 'infer', pixels: pixels.buffer, width: 1280, height: 720 } });
  const result = messages.at(-1); assert.equal(result.id, 2); assert.equal(result.boxes.length, 2);
  assert.equal(result.boxes[0].label, 14); assert.equal(result.boxes[0].x, 540); assert.equal(result.boxes[0].y, 260);
  assert.equal(result.boxes[0].w, 200); assert.equal(result.boxes[0].h, 200);
  assert.ok(Math.abs(feeds[0].images.data[0] - 128 / 255) < .00001); assert.equal(feeds[0].images.data[640 * 640], 1);
  assert.equal(disposed, 1);
  await self.onmessage({ data: { id: 3, type: 'infer', pixels: new ArrayBuffer(4), width: 640, height: 640 } });
  assert.match(messages.at(-1).error, /识别失败/); assert.equal(feeds.length, 1);
});
