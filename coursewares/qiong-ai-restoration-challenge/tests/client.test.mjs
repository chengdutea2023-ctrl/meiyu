import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { csvRows, csvString, headers, packZip, unpackZip, readPack, restoreProgress } from '../client/io.js';
const encoder = new TextEncoder();
test('CSV and ZIP round trip preserves Chinese source notes, quotes, and multiline text', () => {
  const rows = [headers, ['images/r1.png', '口沿,局部', 'https://example.org/证据', '折沿\n局部', '形状"假设"', '保留理由', '生成参考']];
  assert.deepEqual(csvRows(csvString(rows)), rows);
  assert.ok(csvString([['=1+2']]).includes("'=1+2"));
  const files = unpackZip(packZip({ '资料表.csv': encoder.encode(csvString(rows)), 'images/r1.png': new Uint8Array([1, 2]), 'results/evidence.png': new Uint8Array([3]), 'mask.png': new Uint8Array([4]) }));
  const pack = readPack(files); assert.equal(pack.images.length, 1); assert.equal(pack.images[0].metadata['相关特征'], '折沿\n局部');
  assert.throws(() => csvRows('"没有结束'), /引号/);
});
test('corrupt, oversized, path traversal, and invalid progress packages fail before importing', () => {
  assert.throws(() => unpackZip(new Uint8Array([1, 2, 3])));
  assert.throws(() => unpackZip(new ArrayBuffer(35 * 1024 * 1024 + 1)), /35MB/);
  assert.throws(() => unpackZip(packZip({ '../bad.png': new Uint8Array([1]) })), /证据包/);
  assert.throws(() => readPack({ 'a.png': new Uint8Array([1]), 'progress.json': encoder.encode('{"version":1,"constraints":null}') }), /进度包格式/);
  assert.throws(() => readPack({ '资料表.csv': encoder.encode(csvString([headers])) }), /没有PNG/);
  const progress = { version: 1, step: 3, constraints: Array.from({ length: 3 }, () => ({ text: '修复口沿形状', evidenceId: 'r1' })), annotations: [], prediction: '先比较再提出假设', conclusion: '', taskId: null, maskDataUrl: '', saved: true, launchToken: 'must-not-be-imported' };
  const restored = readPack({ 'a.png': new Uint8Array([1]), 'progress.json': encoder.encode(JSON.stringify(progress)) }).progress;
  assert.equal(restored.saved, undefined); assert.equal(restored.launchToken, undefined);
});
const platformSource = await readFile(new URL('../client/platform.js', import.meta.url), 'utf8');
function platformHarness(backend = { record: null }, cache = new Map()) {
  const requests = []; let fail = 'second-artifact';
  const storage = { getItem: k => cache.get(k) || null, setItem: (k, v) => cache.set(k, v) };
  class Reader { readAsDataURL(blob) { blob.arrayBuffer().then(b => { this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`; this.onload(); }); } }
  const context = vm.createContext({ URLSearchParams, URL, AbortSignal, Blob, Date, Map, Uint8Array, crypto: webcrypto, location: { search: '?launchToken=local-fixture&platformApiBase=http%3A%2F%2Flocal-platform%2Fapi%2Fv1' }, localStorage: storage, sessionStorage: storage, FileReader: Reader,
    fetch: async (url, init) => {
      if (url.includes('./api/files/')) { requests.push({url}); return {ok:true,blob:async()=>new Blob(['nonempty-transport-wrapper'],{type:'image/png'}),json:async()=>({dataUrl:'data:image/png;base64,iVBORw0KGgo='})}; }
      const b = JSON.parse(init.body); requests.push({ url, b });
      const response = value => ({ ok: true, json: async () => structuredClone(value) });
      if (url.endsWith('/verify')) return response({ context: { launchSessionId: 'session' }, record: backend.record });
      const artifact = url.endsWith('/artifacts');
      if (fail === 'second-artifact' && artifact && b.fileName === '证据.zip') return { ok: false, json: async () => ({ message: '附件上传失败' }) };
      if (fail === 'record' && b.status === 'COMPLETED') return { ok: false, json: async () => ({ message: '完成记录保存失败' }) };
      backend.record ||= { id: 'record', status: 'STARTED', score: null, artifacts: [] };
      if (artifact) {
        const file = { id: `file-${requests.length}`, kind: b.kind, originalFileName: b.fileName, url: `http://local-platform/files/${requests.length}`, mimeType: b.mimeType, metadata: b.metadata };
        backend.record.artifacts.push(file);
        if (fail === 'artifact-response-lost') throw new Error('上传响应丢失');
        return response(file);
      }
      if (b.status === 'COMPLETED') {
        if (fail === 'unconfirmed-record') return response({ id: 'record', status: 'STARTED', artifacts: [] });
        Object.assign(backend.record, { status: b.status, score: b.score, summary: b.summary });
        if (fail === 'record-response-lost') throw new Error('完成响应丢失');
      }
      return response(backend.record);
    }
  });
  vm.runInContext(platformSource.replace(/export /g, '') + '\nthis.client = {complete, media, initialize, savedExperiment, completionForExperiment, savedProposal, completionForProposal};', context);
  return { client: context.client, requests, backend, cache, setFailure: value => { fail = value; } };
}
test('required upload and record failures never claim saved; retries reuse successful files, concurrent clicks coalesce', async () => {
  const h = platformHarness(), result = { experimentId: 'experiment-1', conclusion: '仍然无法确定历史原貌', holdoutCount: 2, annotationCount: 3, model: 'test' };
  const files = [{ fileName: '报告.png', blob: new Blob(['png']), mimeType: 'image/png', kind: 'final-work' }, { fileName: '证据.zip', blob: new Blob(['zip']), mimeType: 'application/octet-stream', kind: 'evidence-package' }];
  await assert.rejects(h.client.complete('owner', result, files, Date.now()), /附件上传失败/);
  assert.equal(h.requests.filter(r => r.b.status === 'COMPLETED').length, 0);
  h.setFailure('record'); await assert.rejects(h.client.complete('owner', result, files, Date.now()), /完成记录/);
  assert.equal(h.requests.filter(r => r.b.fileName === '报告.png').length, 1);
  h.setFailure(null); const before = h.requests.length;
  const [a, b] = await Promise.all([h.client.complete('owner', result, files, Date.now()), h.client.complete('owner', result, files, Date.now())]);
  assert.equal(a.saved, true); assert.equal(b.saved, true); assert.equal(h.requests.length - before, 2);
  const record = h.requests.at(-1).b; assert.equal(record.score, null); assert.equal(record.summary.artifacts.length, 2); assert.equal(record.summary.scoreText, '未评分，等待教师评价');
  await h.client.complete('owner', { ...result, conclusion: '修改后的审查结论' }, [{ ...files[0], blob: new Blob(['changed PNG']) }, files[1]], Date.now());
  assert.equal(h.requests.filter(r => r.b.fileName === '报告.png').length, 1);
  assert.equal(h.backend.record.summary.brief, result.conclusion);
});

const result = { experimentId: 'experiment-1', conclusion: '仍然无法确定历史原貌', holdoutCount: 2, annotationCount: 3, model: 'test' };
const files = [{ fileName: '报告.png', blob: new Blob(['png']), mimeType: 'image/png', kind: 'final-work' }, { fileName: '证据.zip', blob: new Blob(['zip']), mimeType: 'application/octet-stream', kind: 'evidence-package' }];
test('reload recovers only canonical completion, including legacy records without summary experimentId', async () => {
  const h = platformHarness(); h.setFailure(null); await h.client.complete('owner', result, files, Date.now());
  delete h.backend.record.summary.experimentId;
  const fresh = platformHarness(h.backend); fresh.setFailure(null); await fresh.client.initialize();
  const task = { id: result.experimentId, mocked: false, reviewed: true, review: { annotations: [], conclusion: result.conclusion } };
  assert.equal(fresh.client.savedExperiment([task]).id, task.id);
  assert.equal(fresh.requests.length, 1, 'completed reload must not emit STARTED');
  assert.equal((await fresh.client.complete('owner', result, files, Date.now())).saved, true);
  assert.equal(fresh.requests.filter(r => r.url.endsWith('/artifacts')).length, 0);
  assert.equal(fresh.requests.filter(r => r.b.status === 'COMPLETED').length, 0);
  assert.equal(fresh.client.savedExperiment([{ ...task, id: 'other-task' }]), null);
  assert.equal(fresh.client.savedExperiment([{ ...task, mocked: true }]), null);
});
test('lost artifact response survives an empty browser cache without uploading it again', async () => {
  const h = platformHarness(); h.setFailure('artifact-response-lost');
  await assert.rejects(h.client.complete('owner', result, files, Date.now()), /响应丢失/);
  assert.equal(h.backend.record.artifacts.length, 1);
  const fresh = platformHarness(h.backend); fresh.setFailure(null);
  await fresh.client.complete('owner', result, files, Date.now());
  assert.equal(fresh.requests.filter(r => r.b.fileName === '报告.png').length, 0);
  assert.equal(h.backend.record.artifacts.length, 2);
});
test('lost completion response is recovered without new artifacts or duplicate completion', async () => {
  const h = platformHarness(); h.setFailure('record-response-lost');
  await assert.rejects(h.client.complete('owner', result, files, Date.now()), /完成响应丢失/);
  const fresh = platformHarness(h.backend); fresh.setFailure(null);
  assert.equal((await fresh.client.complete('owner', result, files, Date.now())).saved, true);
  assert.equal(fresh.requests.length, 1);
  assert.equal(h.backend.record.artifacts.length, 2);
});
test('an unsubmitted record or another experiment cannot restore a saved indicator', async () => {
  const h = platformHarness(); h.setFailure(null); await h.client.complete('owner', result, files, Date.now());
  const record = h.backend.record;
  assert.equal(h.client.completionForExperiment({ ...record, status: 'STARTED' }, result.experimentId), null);
  assert.equal(h.client.completionForExperiment({ ...record, artifacts: record.artifacts.slice(0,1) }, result.experimentId), null);
  assert.equal(h.client.completionForExperiment({ ...record, summary: { artifacts: [] } }, result.experimentId), null);
  assert.equal(h.client.completionForExperiment(record, 'another-task'), null);
});
test('editing a failed submission invalidates changed artifacts but preserves unchanged uploads', async () => {
  const h = platformHarness(); h.setFailure('record'); await assert.rejects(h.client.complete('owner', result, files, Date.now()));
  h.setFailure(null);
  await h.client.complete('owner', { ...result, conclusion: '修改后的审查结论' }, [{ ...files[0], blob: new Blob(['changed']) }, files[1]], Date.now());
  assert.equal(h.requests.filter(r => r.b.fileName === '报告.png').length, 2);
  assert.equal(h.requests.filter(r => r.b.fileName === '证据.zip').length, 1);
  assert.equal(h.backend.record.summary.artifacts.length, 2);
});
test('evidence ZIPs have deterministic timestamps so an unchanged retry has identical bytes', async () => {
  const content = { '资料表.csv': encoder.encode('相同的证据内容') };
  const first = packZip(content); await new Promise(resolve => setTimeout(resolve,20));
  assert.deepEqual(packZip(content), first);
});

test('a successful HTTP response without canonical completion cannot claim saved', async () => {
  const h = platformHarness(); h.setFailure('unconfirmed-record');
  await assert.rejects(h.client.complete('owner', result, files, Date.now()), /尚未确认/);
  assert.equal(h.client.savedExperiment([{ id: result.experimentId, reviewed: true, review: { annotations: [] } }]), null);
  h.setFailure(null);
  assert.equal((await h.client.complete('owner', result, files, Date.now())).saved, true);
  assert.equal(h.requests.filter(r => r.url.endsWith('/artifacts')).length, 2);
});

test('progress import preserves owned task evidence IDs; another device restores only preparation', () => {
  const progress = { taskId: 'owned-task', step: 4, constraints: [{ text: '导入的假设', evidenceId: 'r1' }], prediction: '导入的预测', annotations: [{ evidenceId: 'h1' }] };
  const snapshot = { evidence: [{ id: 'r1' }, { id: 'h1' }], constraints: [{ text: '冻结的假设', evidenceId: 'r1' }], prediction: '冻结的预测' };
  const own = restoreProgress(progress, { r1: 'new-r', h1: 'new-h' }, [{ id: 'owned-task', reviewed: true, snapshot }]);
  assert.equal(own.annotations[0].evidenceId, 'h1'); assert.equal(own.constraints[0].text, '冻结的假设'); assert.equal(own.prediction, '冻结的预测'); assert.equal(own.step, 4);
  const other = restoreProgress(progress, { r1: 'new-r', h1: 'new-h' }, []);
  assert.equal(other.taskId, null); assert.equal(other.step, 1); assert.equal(other.constraints[0].evidenceId, 'new-r');
});

test('embedded-browser empty binary responses use authenticated data transport once for concurrent images', async () => { const h = platformHarness(); const [a,b] = await Promise.all([h.client.media('fixture-image'), h.client.media('fixture-image')]); assert.equal(a, 'data:image/png;base64,iVBORw0KGgo='); assert.equal(a,b); assert.equal(h.requests.length,2); assert.ok(h.requests[1].url.endsWith('?format=data')); });

test('simplified five-column evidence templates import without inventing claims or reasons', () => {
  const rows=[['文件名','标题','来源','相关特征','用途'],['images/simple.png','参考图片','馆藏图录第12页','我发现口沿向外翻','核验保留']];
  const pack=readPack(unpackZip(packZip({'资料表.csv':encoder.encode(csvString(rows)),'images/simple.png':new Uint8Array([1,2])})));
  assert.equal(pack.images[0].metadata['来源'],'馆藏图录第12页');assert.equal(pack.images[0].metadata['相关特征'],'我发现口沿向外翻');assert.equal(pack.images[0].metadata['用途'],'核验保留');assert.equal(pack.images[0].metadata['支持的判断'],undefined);assert.equal(pack.images[0].metadata['筛选理由'],undefined);
});


test('v2 text-only proposal completes without any generated image, and reload restores only its canonical artifacts', async () => {
  const h=platformHarness();h.setFailure(null);const result={proposalId:'proposal-2',proposalText:'我想修成外翻圆口，因为线索1也是外翻口沿。',clueCount:1,aiState:'not_requested'};
  const files=[{fileName:'方案.png',blob:new Blob(['plan-png']),mimeType:'image/png',kind:'final-work'},{fileName:'线索.zip',blob:new Blob(['clues']),mimeType:'application/octet-stream',kind:'evidence-package'}];
  assert.equal((await h.client.complete('owner',result,files,Date.now())).saved,true);
  assert.equal(h.backend.record.score,null);assert.equal(h.backend.record.summary.proposalId,result.proposalId);assert.equal(h.backend.record.summary.workflowVersion,2);assert.match(h.backend.record.summary.resultItems[2].value,/未采用AI/);assert.ok(!JSON.stringify(h.backend.record.summary).includes('undefined'));
  assert.ok(h.backend.record.artifacts.every(a=>a.metadata.proposalId===result.proposalId));
  const fresh=platformHarness(h.backend);fresh.setFailure(null);await fresh.client.initialize();assert.equal(fresh.client.savedProposal([{id:result.proposalId}]).id,result.proposalId);assert.equal(fresh.client.savedProposal([{id:'other-proposal'}]),null);
  assert.equal((await fresh.client.complete('owner',result,files,Date.now())).saved,true);assert.equal(fresh.requests.filter(r=>r.url.endsWith('/artifacts')).length,0);
});
test('v2 proposal upload failure remains retryable and an experiment artifact cannot satisfy a proposal submission', async () => {
  const h=platformHarness(),result={proposalId:'proposal-failure',proposalText:'根据线索提出方案',clueCount:1,aiState:'failed'};
  await assert.rejects(h.client.complete('owner',result,files,Date.now()),/附件上传失败/);assert.equal(h.requests.some(r=>r.b.status==='COMPLETED'),false);h.setFailure(null);await h.client.complete('owner',result,files,Date.now());assert.equal(h.requests.filter(r=>r.b.fileName==='报告.png').length,1);
  assert.equal(h.client.completionForExperiment(h.backend.record,result.proposalId),null);
  const record=structuredClone(h.backend.record);record.artifacts[0].metadata={experimentId:result.proposalId};assert.equal(h.client.completionForProposal(record,result.proposalId),null);
});
