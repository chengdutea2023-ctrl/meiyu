import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('shared restoration identity works for student preparation, teacher review and classroom access', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'restoration-linked-launch-'));
  Object.assign(process.env, {
    PORT: '0', PLATFORM_API_BASE: 'https://platform.example.invalid/api/v1',
    COURSEWARE_DATA_DIR: dir, COURSE_SLUG: 'source-course',
    COURSEWARE_SLUG: 'restoration', COURSEWARE_ID: 'restoration-id',
    ALLOW_LOCAL_DEMO: '0',
  });
  for (const key of ['COURSEWARE_ENV_FILE', 'ARK_API_KEY', 'AI_TEST_ALLOWANCE']) delete process.env[key];
  const realFetch = globalThis.fetch;
  let context, platformStatus = 200, server;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://platform.example.invalid/')) {
      const input = JSON.parse(options.body);
      assert.equal(input.preparationToken || input.launchToken, 'isolated-test-token');
      assert.equal(String(url).endsWith('/preparation/verify'), Boolean(input.preparationToken));
      return new Response(JSON.stringify({ context }), { status: platformStatus });
    }
    assert.ok(String(url).startsWith('http://127.0.0.1:'), 'Tests must not call a model provider');
    return realFetch(url, options);
  };
  const studentContext = () => ({
    role: 'STUDENT', actor: { id: 'student-id' }, student: { id: 'student-id', userType: 'STUDENT' },
    assignment: { id: 'assignment-id' }, course: { slug: 'source-course' },
    courseware: { id: 'restoration-id', slug: 'restoration' },
  });
  const call = async (path, preparation = false, method = 'GET', body) => {
    const response = await realFetch('http://127.0.0.1:' + server.address().port + '/api/' + path, {
      method, headers: { 'content-type': 'application/json', ...(preparation
        ? { 'x-preparation-token': 'isolated-test-token' }
        : { authorization: 'Bearer isolated-test-token' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    ({ server } = await import('../server/server.js'));
    if (!server.listening) await once(server, 'listening');
    context = studentContext();
    const original = await call('session');
    assert.equal(original.status, 200);
    context.course.slug = 'linked-course';
    const linked = await call('session');
    assert.equal(linked.status, 200);
    assert.equal(linked.body.ownerId, original.body.ownerId);
    const prepared = await call('preparation', true);
    assert.equal(prepared.status, 200);
    assert.equal(prepared.body.context.course.slug, 'linked-course');
    assert.deepEqual(prepared.body.assets, []);
    assert.equal((await call('preparation/settings', true, 'POST', { enabled: true })).status, 403);
    assert.equal((await call('proposals', true, 'POST', {})).body.code, 'PREPARATION_SCOPE');
    context.assignment.id = 'other-assignment';
    assert.notEqual((await call('session')).body.ownerId, original.body.ownerId);
    context = { ...studentContext(), role: 'TEACHER', actor: { id: 'teacher-id' }, student: null,
      students: [{ id: 'student-id', name: '测试学生' }], course: { slug: 'linked-course' } };
    const review = await call('preparation', true);
    assert.equal(review.status, 200);
    assert.equal(review.body.students.length, 1);
    assert.equal((await call('session')).status, 403);
    for (const change of [
      value => { value.courseware.id = 'unrelated-restoration'; },
      value => { delete value.courseware.id; },
      value => { value.courseware.slug = 'other-restoration'; },
      value => { delete value.student.id; },
      value => { delete value.assignment.id; },
    ]) {
      context = studentContext();
      change(context);
      assert.equal((await call('preparation', true)).body.code, 'LAUNCH_MISMATCH');
    }
    platformStatus = 401;
    assert.equal((await call('preparation', true)).body.code, 'LAUNCH_INVALID');
    platformStatus = 403;
    assert.equal((await call('session')).body.code, 'LAUNCH_INVALID');
    platformStatus = 200;
    delete process.env.COURSEWARE_ID;
    context = studentContext();
    assert.equal((await call('session')).status, 200);
    context.course.slug = 'linked-course';
    assert.equal((await call('preparation', true)).body.code, 'COURSE_MISMATCH');
    const health = await realFetch('http://127.0.0.1:' + server.address().port + '/api/health').then(r => r.json());
    assert.equal(health.requestsUsed, 0);
    assert.equal(health.evidence.requestsUsed, 0);
  } finally {
    globalThis.fetch = realFetch;
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
