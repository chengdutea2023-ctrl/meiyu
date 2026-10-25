import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { digest } from '../server/domain.mjs';
import { preparationDigest } from '../server/preparation.mjs';

test('formal student reset survives retries and refresh, isolates owners, rejects stale writes, and retains paid budget', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'restoration-reset-api-'));
  const id = digest('student:assignment:ware').slice(0, 40), ownerDir = join(dir, id);
  await mkdir(ownerDir);
  const assets = [{ id: 'reference-photo-12345', role: 'reference', usedInGeneration: true }, { id: 'holdout-photo-one-12345', role: 'holdout' }, { id: 'holdout-photo-two-12345', role: 'holdout' }];
  for (const [index, asset] of assets.entries()) {
    const bytes = await sharp({ create: { width: 40, height: 40, channels: 3, background: ['#f00','#0f0','#00f'][index] } }).png().toBuffer();
    Object.assign(asset, { hash: digest(bytes), title: `学生照片${index + 1}`, source: '本地测试夹具实拍说明', feature: '口沿向外翻', origin: 'student', builtinId: null });
    await writeFile(join(ownerDir, `${asset.id}.png`), bytes);
  }
  const original = { id, assets, holdoutFrozen: assets.slice(1).map(a => a.id), preparation: { status: 'APPROVED', revision: 8, evidenceDigest: preparationDigest(assets), teacherName: '测试教师' },
    tasks: [{ id: 'finished-experiment-12345', ownerId: id, requestId: 'finished-experiment-request-123', snapshot: { evidence: structuredClone(assets), referenceIds: [assets[0].id], holdoutIds: assets.slice(1).map(a => a.id) }, results: [{ key: 'none', state: 'succeeded', fileId: 'finished-result-file-12345' }] }] };
  await writeFile(join(ownerDir,'state.json'), JSON.stringify(original));
  await writeFile(join(ownerDir,'finished-result-file-12345.png'), 'archived-result-bytes');
  await writeFile(join(dir,'request-count.json'), JSON.stringify({ count: 6 }));
  const verifier = createServer(async (req, res) => {
    let raw = ''; for await (const part of req) raw += part;
    const b = JSON.parse(raw), token = b.preparationToken || b.launchToken;
    res.setHeader('content-type','application/json');
    if (token === 'expired') { res.writeHead(401); return res.end('{}'); }
    const teacher = token === 'teacher', student = token === 'other' ? 'other-student' : 'student';
    res.end(JSON.stringify({ context: { ...(teacher ? { role: 'TEACHER' } : b.preparationToken ? { role: 'STUDENT' } : {}), actor: { id: teacher ? 'teacher' : student }, student: { id: student, userType: teacher ? 'TEACHER' : 'STUDENT' }, assignment: { id: 'assignment' }, courseware: { id: 'ware', slug: 'reset-fixture' }, course: { slug: 'fixture' } } }));
  });
  verifier.listen(0,'127.0.0.1'); await once(verifier,'listening');
  Object.assign(process.env, { PLATFORM_API_BASE: `http://127.0.0.1:${verifier.address().port}`, COURSEWARE_DATA_DIR: dir, COURSE_SLUG: 'fixture', COURSEWARE_SLUG: 'reset-fixture', ALLOW_LOCAL_DEMO: '1', AI_TEST_MOCK: '1', AI_MAX_REQUESTS: '9', MOCK_DELAY_MS: '180', PORT: '0' });
  delete process.env.ARK_API_KEY; delete process.env.COURSEWARE_ENV_FILE;
  let lesson;
  try {
    lesson = (await import('../server/server.js')).server; if (!lesson.listening) await once(lesson,'listening');
    let base = `http://127.0.0.1:${lesson.address().port}/api/`;
    async function call(path, { method = 'GET', token = 'student', version, body, prep = false } = {}) {
      const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? prep ? { 'x-preparation-token': token } : { authorization: `Bearer ${token}` } : {}), ...(version === undefined ? {} : { 'x-lesson-version': String(version) }) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    }
    const reset = (requestId, version = 0, extra = {}) => call('reset', { method: 'POST', body: { requestId }, version, ...extra });
    const initial = (await call('session')).body;
    assert.equal(initial.resetAllowed, true); assert.equal(initial.resetVersion, 0);
    assert.equal((await reset('unauthorized-reset-request', 0, { token: null })).status, 401);
    assert.equal((await reset('expired-reset-request-123', 0, { token: 'expired' })).status, 401);
    assert.equal((await reset('teacher-reset-request-123', 0, { token: 'teacher' })).status, 403);
    assert.equal((await reset('preparation-reset-request', 0, { prep: true })).status, 403);
    const beforeOther = (await call('session', { token: 'other' })).body;
    const requestId = 'concurrent-reset-request-123';
    const responses = await Promise.all([reset(requestId), reset(requestId)]);
    assert.ok(responses.every(r => r.status === 200));
    assert.equal(responses[0].body.session.lastResetId, responses[1].body.session.lastResetId);
    let session = (await call('session')).body;
    assert.equal(session.resetVersion, 1); assert.deepEqual(session.tasks, []); assert.equal(session.canUndoReset, true);
    assert.deepEqual(session.assets, initial.assets); assert.deepEqual(session.preparation, initial.preparation);
    assert.deepEqual((await call('session', { token: 'other' })).body, beforeOther);
    assert.equal((await call('health')).body.requestsUsed, 6);
    assert.equal((await call(`experiments/${original.tasks[0].id}`)).status, 404);
    assert.equal((await call(`experiments/${original.tasks[0].id}/retry`, { method: 'POST', version: 1, body: {} })).status, 404);
    const stale = await call('experiments', { method: 'POST', version: 0, body: { requestId: 'stale-experiment-request-123' } });
    assert.equal(stale.status, 409); assert.equal(stale.body.code, 'LESSON_RESET');
    assert.equal((await call('experiments', { method: 'POST', version: 1, body: { requestId: original.tasks[0].requestId } })).status, 409);
    assert.equal((await call('assets', { method: 'POST', body: {}, prep: true })).status, 409);
    assert.equal((await call('preparation', { prep: true })).body.resetVersion, 1);
    const fileBefore = await readFile(join(ownerDir, `${assets[0].id}.png`));
    assert.equal((await call(`files/${assets[0].id}?format=data`)).body.dataUrl, `data:image/png;base64,${fileBefore.toString('base64')}`);
    let persisted = JSON.parse(await readFile(join(ownerDir,'state.json')));
    assert.deepEqual(persisted.holdoutFrozen, original.holdoutFrozen); assert.deepEqual(persisted.resetHistory[0].tasks, original.tasks);
    assert.equal(await readFile(join(ownerDir,'finished-result-file-12345.png'),'utf8'), 'archived-result-bytes');
    // A fresh service must still open the reset state, rather than resurrecting the old experiment.
    await new Promise(resolve => lesson.close(resolve));
    lesson = (await import('../server/server.js?restart-reset-fixture')).server; if (!lesson.listening) await once(lesson,'listening');
    base = `http://127.0.0.1:${lesson.address().port}/api/`;
    assert.equal((await call('session')).body.resetVersion, 1); assert.deepEqual((await call('session')).body.tasks, []);
    const restored = await call('reset/undo', { method: 'POST', version: 1, body: { requestId: 'restore-idempotent-request-123' } });
    assert.equal(restored.status, 200); assert.equal(restored.body.session.tasks[0].id, original.tasks[0].id); assert.equal(restored.body.session.resetVersion, 2);
    assert.equal((await call('health')).body.requestsUsed, 6);
    assert.equal((await reset('second-reset-request-12345', 2)).status, 200);
    const mask = await readFile(new URL('../static/assets/case-mask.png', import.meta.url));
    const input = { requestId: 'new-experiment-request-12345', referenceIds: [assets[0].id], constraints: [1,2,3].map(n => ({ text: `约束${n}保留口沿纹理`, evidenceId: assets[0].id })), prediction: '课堂重置之后重新预测口沿形状。', maskDataUrl: `data:image/png;base64,${mask.toString('base64')}` };
    const experiment = await call('experiments', { method: 'POST', version: 3, body: input });
    assert.equal(experiment.status, 202, JSON.stringify(experiment.body));
    const active = await reset('running-reset-request-12345', 3);
    assert.equal(active.status, 409); assert.equal(active.body.code, 'EXPERIMENT_RUNNING');
    assert.equal((await call('reset/undo', { method: 'POST', version: 3, body: { requestId: 'restore-after-new-experiment' } })).status, 409);
    for (let n = 0; n < 120; n++) { session = (await call('session')).body; if (session.tasks[0].state !== 'running') break; await new Promise(resolve => setTimeout(resolve, 30)); }
    assert.equal(session.tasks[0].state, 'succeeded'); assert.equal((await call('health')).body.requestsUsed, 9);
    assert.deepEqual(session.preparation, initial.preparation);
    assert.ok(!session.tasks[0].results.flatMap(r => r.inputHashes).includes(assets[1].hash));
    assert.equal((await reset('third-reset-request-12345', 3)).status, 200);
    assert.equal((await call('health')).body.requestsUsed, 9, 'reset must never refund the paid quota');
    assert.deepEqual(await readFile(join(ownerDir, `${assets[0].id}.png`)), fileBefore);
  } finally {
    if (lesson?.listening) await new Promise(resolve => lesson.close(resolve));
    await new Promise(resolve => verifier.close(resolve)); await rm(dir, { recursive: true, force: true });
  }
});
