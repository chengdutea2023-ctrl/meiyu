import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
const dir = await mkdtemp(join(tmpdir(), 'qiong-restoration-test-'));
process.env.PORT = '0'; process.env.HOST = '127.0.0.1'; process.env.ALLOW_LOCAL_DEMO = '1'; process.env.AI_TEST_MOCK = '1'; process.env.COURSEWARE_DATA_DIR = dir; process.env.MOCK_DELAY_MS = '1'; process.env.AI_TEST_FAIL_KEY = 'mismatch';
const { server } = await import('../server/server.js'); if (!server.listening) await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const owner = 'isolated-server-test-123456789', other = 'isolated-server-test-987654321';
async function req(path, method = 'GET', body, id = owner) { const r = await fetch(base + '/api/' + path, { method, headers: { 'content-type': 'application/json', ...(id ? { 'x-demo-id': id } : {}) }, body: body ? JSON.stringify(body) : undefined }); const value = r.headers.get('content-type')?.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()); return { status: r.status, value }; }
async function settled(id) { for (let i = 0; i < 150; i++) { const r = await req(`experiments/${id}`); if (r.value.task?.state !== 'running') return r.value.task; await new Promise(r => setTimeout(r, 30)); } throw new Error('Task did not finish'); }
test('authenticated lifecycle, failed-item retry, idempotency, and holdout isolation', async t => {
  try {
    assert.equal((await req('session', 'GET', null, null)).status, 401);
    assert.equal((await req('assets/teacher-pack', 'POST', {})).status, 200);
    const { assets } = (await req('session')).value; assert.equal(assets.length, 8);
    const refs = assets.filter(a => a.role === 'reference').map(a => a.id), holdouts = assets.filter(a => a.role === 'holdout').map(a => a.id);
    const mask = await readFile(new URL('../static/assets/case-mask.png', import.meta.url));
    const input = { requestId: 'unique-experiment-test-123456789', referenceIds: refs, prediction: '我预测学生参考图会影响口沿形状，但结果仍可能不准确。', constraints: refs.map((id, i) => ({ text: `第${i + 1}条修复约束依据`, evidenceId: id })), maskDataUrl: `data:image/png;base64,${mask.toString('base64')}` };
    const [a, b] = await Promise.all([req('experiments', 'POST', input), req('experiments', 'POST', input)]); assert.ok([200, 202].includes(a.status)); assert.equal(a.value.task.id, b.value.task.id);
    let task = await settled(a.value.task.id); assert.equal(task.results.filter(r => r.state === 'succeeded').length, 2); assert.equal(task.results.find(r => r.key === 'mismatch').state, 'failed');
    assert.equal((await req(`case/original?experimentId=${task.id}`)).status, 403);
    assert.equal((await req(`experiments/${task.id}`, 'GET', null, other)).status, 404);
    const successBefore = task.results.filter(r => r.state === 'succeeded').map(r => r.fileId);
    assert.equal((await req(`experiments/${task.id}/retry`, 'POST', {})).status, 202);
    task = await settled(task.id); assert.equal(task.state, 'succeeded'); assert.deepEqual(task.results.filter(r => r.key !== 'mismatch').map(r => r.fileId), successBefore);
    assert.deepEqual(task.results.map(r => r.inputHashes[0]), [task.snapshot.targetHash, task.snapshot.targetHash, task.snapshot.targetHash]);
    assert.equal(new Set(task.results.map(r => r.promptHash)).size, 1); assert.deepEqual(task.results.map(r => r.referenceCount), [0, 3, 3]);
    for (const r of task.results) for (const id of holdouts) assert.ok(!r.inputHashes.includes(assets.find(a => a.id === id).hash));
    assert.equal((await req(`assets/${refs[0]}`, 'PATCH', { role: 'holdout' })).status, 400);
    assert.equal((await req(`assets/${holdouts[0]}`, 'PATCH', { role: 'reference' })).status, 400);
    assert.equal((await req('experiments', 'POST', { ...input, requestId: 'invalid-leaking-test-123456789', referenceIds: [holdouts[0]] })).status, 400);
    const annotations = ['none', 'mismatch', 'evidence'].map(condition => ({ condition, x: 0.6, y: 0.2, kind: 'uncertain', evidenceId: holdouts[0], reason: '目前资料无法证明这个口沿就是原貌' }));
    assert.equal((await req(`experiments/${task.id}/review`, 'POST', { annotations: [], conclusion: '测试' })).status, 400);
    assert.equal((await req(`experiments/${task.id}/review`, 'POST', { annotations, conclusion: '参考资料可能影响补全形状，但这些证据不足以确定历史原貌。' })).status, 200);
    assert.equal((await req(`case/original?experimentId=${task.id}`)).status, 200);
    assert.equal((await req(`files/${task.results[0].fileId}`, 'GET', null, other)).status, 404);
    const dataFile = await req(`files/${task.results[0].fileId}?format=data`); assert.ok(dataFile.value.dataUrl.startsWith('data:image/png;base64,iVBOR')); assert.ok(dataFile.value.dataUrl.length > 1000);
    assert.equal((await req(`files/${task.results[0].fileId}?format=data`, 'GET', null, other)).status, 404);
    assert.equal((await fetch(base + '/server/private/case-original.png')).status, 404);
    const health = (await req('health')).value; assert.equal(health.requestsUsed, 3); assert.equal(health.mocked, true);
  } finally { await new Promise(r => server.close(r)); await rm(dir, { recursive: true, force: true }); }
});
