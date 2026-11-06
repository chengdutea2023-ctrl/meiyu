import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { digest } from '../server/domain.mjs';

const dir = await mkdtemp(join(tmpdir(), 'qiong-unlimited-grant-'));
const demoId = 'authorized-unlimited-grant-student';
const ownerId = digest('demo:' + demoId).slice(0, 40);
const ownerDir = join(dir, ownerId);
await mkdir(ownerDir);
await writeFile(join(dir, 'request-count.json'), JSON.stringify({ count: 18 }));
await writeFile(join(ownerDir, 'state.json'), JSON.stringify({
  id: ownerId, proposalGenerationCount: 3, assets: [], tasks: [], holdoutFrozen: [], resetHistory: [],
}));
Object.assign(process.env, {
  ALLOW_LOCAL_DEMO: '1', AI_TEST_MOCK: '1', AI_MAX_REQUESTS: '0',
  AI_TEST_ALLOWANCE: JSON.stringify({ ownerId, proposalLimit: 6, extraRequests: 3 }),
  COURSEWARE_DATA_DIR: dir, PORT: '0', MOCK_DELAY_MS: '5',
});
for (const key of ['ARK_API_KEY', 'COURSEWARE_ENV_FILE', 'AI_TEST_FAIL_KEY', 'AI_TEST_UNKNOWN_KEY']) delete process.env[key];
const { server } = await import('../server/server.js');
if (!server.listening) await once(server, 'listening');
const root = 'http://127.0.0.1:' + server.address().port + '/api/';

async function call(path, value, id = demoId, version = 0) {
  const response = await fetch(root + path, {
    method: value === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-demo-id': id, 'x-lesson-version': String(version) },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
  return { status: response.status, body: await response.json() };
}

async function generate(id, requestId) {
  const image = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#246f58' } }).png().toBuffer();
  const { body: upload } = await call('assets', {
    role: 'clue', source: '本机测试', feature: '口沿呈弧形', dataUrl: 'data:image/png;base64,' + image.toString('base64'),
  }, id);
  const { status, body } = await call('proposals', {
    requestId, clueIds: [upload.asset.id], proposalText: '根据线索补齐缺口', proposalLimit: 99,
  }, id);
  assert.equal(status, 201);
  const path = 'proposals/' + body.proposal.id;
  assert.equal((await call(path + '/generate', {}, id)).status, 202);
  for (let attempt = 0; attempt < 100; attempt++) {
    const { body: result } = await call(path, undefined, id);
    if (!['pending', 'running'].includes(result.proposal.aiState)) return result.proposal;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error('Mock generation did not settle');
}

test('an authorized task gets three extra opportunities while other tasks retain their three and can still generate', async () => {
  try {
    assert.deepEqual((await call('session')).body.proposalGeneration, { used: 3, limit: 6, remaining: 3 });
    assert.equal((await call('health')).body.requestLimit, null);
    const otherId = 'unlisted-unlimited-grant-student';
    assert.deepEqual((await call('session', undefined, otherId)).body.proposalGeneration, { used: 0, limit: 3, remaining: 3 });
    const authorized = await generate(demoId, 'authorized-grant-request-123');
    assert.equal(authorized.aiState, 'succeeded');
    assert.deepEqual((await call('session')).body.proposalGeneration, { used: 4, limit: 6, remaining: 2 });
    const other = await generate(otherId, 'other-grant-request-123456');
    assert.equal(other.aiState, 'succeeded');
    assert.deepEqual((await call('session', undefined, otherId)).body.proposalGeneration, { used: 1, limit: 3, remaining: 2 });
    const reset = await call('reset', { requestId: 'grant-reset-request-123456' });
    assert.deepEqual(reset.body.session.proposalGeneration, { used: 4, limit: 6, remaining: 2 });
    assert.equal(reset.body.session.assets.length, 1);
    const stored = JSON.parse(await readFile(join(ownerDir, 'state.json')));
    assert.equal(stored.resetHistory[0].tasks[0].id, authorized.id);
    const health = (await call('health')).body;
    assert.equal(health.requestsUsed, 20);
    assert.equal(health.requestLimit, null);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
