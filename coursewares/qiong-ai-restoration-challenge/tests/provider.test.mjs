import test from 'node:test';
import assert from 'node:assert/strict';
import { generateImage } from '../server/provider.mjs';
const input = { images: ['data:image/png;base64,TARGET', 'data:image/png;base64,REFERENCE'], prompt: 'frozen prompt', model: 'test-model', apiKey: 'local-unit-fixture' };
test('real-provider request keeps target and reference order, model, size, and frozen prompt', async () => {
  let sent; const data = Buffer.alloc(1200, 1);
  const output = await generateImage({ ...input, fetcher: async (url, init) => { sent = { url, ...JSON.parse(init.body) }; return { ok: true, json: async () => ({ data: [{ b64_json: data.toString('base64') }] }) }; } });
  assert.deepEqual(output, data); assert.deepEqual(sent.image, input.images); assert.equal(sent.prompt, input.prompt); assert.equal(sent.model, input.model); assert.equal(sent.size, '1K'); assert.equal(sent.response_format, 'b64_json'); assert.match(sent.url, /^https:\/\/ark\.cn-beijing\.volces\.com\//);
});
test('transport timeout and ambiguous success cannot be automatically retried as failed requests', async () => {
  for (const fetcher of [async () => { throw new Error('timeout'); }, async () => ({ ok: true, json: async () => { throw new Error('broken JSON'); } }), async () => ({ ok: true, json: async () => ({ data: [] }) })]) {
    await assert.rejects(generateImage({ ...input, fetcher }), e => e.code === 'AI_RESULT_UNKNOWN');
  }
  await assert.rejects(generateImage({ ...input, fetcher: async () => ({ ok: false, status: 429, arrayBuffer: async () => new ArrayBuffer(0) }) }), e => e.code === 'AI_REJECTED' && e.status === 429);
});
