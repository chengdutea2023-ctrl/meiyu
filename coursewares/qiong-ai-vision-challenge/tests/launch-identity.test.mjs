import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('verified courseware IDs accept linked courses and reject unrelated or restricted launches', async () => {
  const data = await mkdtemp(join(tmpdir(), 'vision-launch-'));
  Object.assign(process.env, {
    PORT: '0', COURSEWARE_DATA_DIR: data,
    PLATFORM_API_BASE: 'https://platform.example.invalid/api/v1',
    COURSE_SLUG: 'source-course', COURSEWARE_SLUG: 'vision',
    COURSEWARE_ID: 'vision-courseware-id',
  });
  delete process.env.COURSEWARE_ENV_FILE;
  delete process.env.ALLOW_LOCAL_DEMO;
  const realFetch = globalThis.fetch;
  let context, platformStatus = 200, unavailable = false, calls = 0, server;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://platform.example.invalid/')) {
      calls++;
      if (unavailable) throw Error('Platform unavailable');
      assert.equal(JSON.parse(options.body).launchToken, 'isolated-launch-test');
      return new Response(JSON.stringify({ context }), { status: platformStatus });
    }
    assert.ok(String(url).startsWith('http://127.0.0.1:'), 'Tests must not contact a model provider');
    return realFetch(url, options);
  };
  const freshContext = () => ({
    course: { slug: 'source-course' },
    courseware: { id: 'vision-courseware-id', slug: 'vision' },
    student: { id: 'student-id' }, assignment: { id: 'assignment-id' },
  });
  const probe = async () => {
    const response = await realFetch('http://127.0.0.1:' + server.address().port + '/api/recognize', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer isolated-launch-test' },
      body: JSON.stringify({ diagnostic: true }),
    });
    return { status: response.status, code: (await response.json()).code };
  };
  try {
    ({ server } = await import('../server/server.js?identity-test'));
    if (!server.listening) await once(server, 'listening');
    for (const slug of ['source-course', 'linked-course']) {
      context = freshContext();
      context.course.slug = slug;
      assert.deepEqual(await probe(), { status: 400, code: 'UNEXPECTED_METADATA' });
    }
    for (const change of [
      value => { value.courseware.id = 'other-courseware-id'; },
      value => { delete value.courseware.id; },
      value => { value.courseware.slug = 'other-vision'; },
      value => { delete value.student.id; },
      value => { delete value.assignment.id; },
      value => { value.readOnlyPreview = true; },
      value => { value.student.readOnlyPreview = true; },
    ]) {
      context = freshContext();
      change(context);
      assert.deepEqual(await probe(), { status: 403, code: 'LAUNCH_MISMATCH' });
    }
    for (const status of [401, 403]) {
      platformStatus = status;
      assert.deepEqual(await probe(), { status: 401, code: 'LAUNCH_INVALID' });
    }
    platformStatus = 200;
    unavailable = true;
    assert.deepEqual(await probe(), { status: 503, code: 'PLATFORM_UNAVAILABLE' });
    unavailable = false;
    await new Promise(resolve => server.close(resolve));
    delete process.env.COURSEWARE_ID;
    ({ server } = await import('../server/server.js?legacy-identity-test'));
    if (!server.listening) await once(server, 'listening');
    context = freshContext();
    assert.deepEqual(await probe(), { status: 400, code: 'UNEXPECTED_METADATA' });
    context.course.slug = 'linked-course';
    assert.deepEqual(await probe(), { status: 403, code: 'LAUNCH_MISMATCH' });
    assert.equal(calls, 14);
  } finally {
    globalThis.fetch = realFetch;
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await rm(data, { recursive: true, force: true });
  }
});
