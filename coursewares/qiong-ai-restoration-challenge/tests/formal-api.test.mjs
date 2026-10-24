import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'qiong-formal-test-'));
const ownerId = createHash('sha256').update('fixture-student:fixture-assignment:fixture-ware').digest('hex').slice(0, 40);
const recoveredTask = { id: 'interrupted-task-123456789', ownerId, snapshot: {}, results: [{ key: 'none', state: 'succeeded' }, { key: 'mismatch', state: 'running' }, { key: 'evidence', state: 'pending' }] };
await mkdir(join(dir, ownerId)); await writeFile(join(dir, ownerId, 'state.json'), JSON.stringify({ id: ownerId, assets: [], tasks: [recoveredTask], holdoutFrozen: [] }));
const verifier = createServer(async (req, res) => { let input = ''; for await (const part of req) input += part; const token = JSON.parse(input).launchToken;
  res.setHeader('content-type', 'application/json'); if (token === 'expired') { res.writeHead(401); return res.end('{}'); }
  res.end(JSON.stringify({ context: { student: { id: 'fixture-student' }, assignment: { id: 'fixture-assignment' }, courseware: { id: 'fixture-ware', slug: token === 'wrong-ware' ? 'qiong-ai-restoration-challenge' : 'platform-assigned-ware' }, course: { slug: token === 'wrong-course' ? 'other' : 'qiong-fixture-course' } } }));
});
verifier.listen(0, '127.0.0.1'); await once(verifier, 'listening');
process.env.PLATFORM_API_BASE = `http://127.0.0.1:${verifier.address().port}`; process.env.COURSE_SLUG = 'qiong-fixture-course'; process.env.COURSEWARE_SLUG = 'platform-assigned-ware'; process.env.COURSEWARE_DATA_DIR = dir; process.env.ALLOW_LOCAL_DEMO = '0'; process.env.AI_TEST_MOCK = '1'; process.env.PORT = '0'; delete process.env.ARK_API_KEY;
const { server } = await import('../server/server.js'); if (!server.listening) await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
async function req(path, token, method = 'GET', value) { const r = await fetch(base + '/api/' + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : { 'x-demo-id': 'not-allowed-local-demo' }) }, body: value ? JSON.stringify(value) : undefined }); return { status: r.status, body: await r.json() }; }
test('formal launch honors platform-assigned slug, checks exact context, disables mock and recovers without resending', async () => {
  try {
    assert.equal((await req('session', null)).status, 401); assert.equal((await req('session', 'expired')).status, 401); assert.equal((await req('session', 'wrong-ware')).status, 403); assert.equal((await req('session', 'wrong-course')).status, 403);
    const first = await req('session', 'launch-1'), renewed = await req('session', 'launch-2');
    assert.equal(first.status, 200); assert.equal(first.body.ownerId, renewed.body.ownerId); assert.equal(first.body.mocked, false);
    assert.deepEqual(first.body.tasks[0].results.map(r => r.state), ['succeeded', 'unknown', 'failed']);
    assert.equal((await req('health', null)).body.requestsUsed, 0);
    assert.equal((await req('experiments', 'launch-1', 'POST', { requestId: 'missing-key-test-123456789' })).status, 403);
    assert.equal((await fetch(base + '/server/private/case-original.png')).status, 404);
  } finally { await new Promise(r => server.close(r)); await new Promise(r => verifier.close(r)); await rm(dir, { recursive: true, force: true }); }
});
