import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { compositeMasked, normalizedMask, validateEvidence, validateReview, experimentPrompt, digest } from '../server/domain.mjs';
test('masked composition preserves every outside pixel, including alpha', async () => {
  const original = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 12, g: 35, b: 60, alpha: 0.7 } } }).png().toBuffer();
  const generated = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 210, g: 100, b: 80, alpha: 1 } } }).png().toBuffer();
  const mask = Buffer.alloc(4096); for (let y = 12; y < 25; y++) for (let x = 10; x < 35; x++) mask[y * 64 + x] = 255;
  const result = await sharp(await compositeMasked(original, generated, mask)).raw().toBuffer(), base = await sharp(original).raw().toBuffer();
  for (let p = 0; p < 4096; p++) if (!mask[p]) assert.deepEqual(result.subarray(p * 4, p * 4 + 4), base.subarray(p * 4, p * 4 + 4));
  assert.equal(result[(15 * 64 + 15) * 4], 210);
});
test('empty masks and oversized masks cannot create a paid experiment', async () => {
  for (const color of ['black', 'white']) { const b = await sharp({ create: { width: 64, height: 64, channels: 4, background: color } }).png().toBuffer(); await assert.rejects(normalizedMask(b, 64, 64), /修复区域/); }
});
const assets = ['r', 'h1', 'h2'].map((id, i) => ({ id, role: i ? 'holdout' : 'reference', source: '馆藏图录第12页', feature: '口沿', claim: '可能外撇', reason: '比较形状' }));
const constraints = [1, 2, 3].map(i => ({ text: `修复约束第${i}条`, evidenceId: 'r' }));
test('holdout evidence cannot leak into generation or be reused after generation', () => {
  validateEvidence(assets, ['r'], ['h1', 'h2'], constraints);
  assert.throws(() => validateEvidence(assets, ['r', 'h1'], ['h1', 'h2'], constraints), /核验资料/);
  assert.throws(() => validateEvidence(assets.map(a => ({ ...a, usedInGeneration: a.id === 'h2' })), ['r'], ['h1', 'h2'], constraints), /从未参与生成/);
});
test('review requires a justified position in every condition and a held-out citation', () => {
  const task = { snapshot: { holdoutIds: ['h1', 'h2'] }, results: [1, 2, 3].map(() => ({ state: 'succeeded' })) };
  const annotations = ['none', 'mismatch', 'evidence'].map(condition => ({ condition, kind: 'uncertain', evidenceId: 'h1', reason: '口沿与核验资料存在差异', x: 0.5, y: 0.2 }));
  validateReview(annotations, '这些资料不足以确定目标器物原本的口沿形状。', task);
  assert.throws(() => validateReview(annotations.slice(1), '这些资料不足以确定目标器物原本的口沿形状。', task), /每组/);
  assert.throws(() => validateReview(annotations.map(a => ({ ...a, evidenceId: 'r' })), '这些资料不足以确定目标器物原本的口沿形状。', task), /每组/);
});
test('one frozen prompt is independent of experimental condition and includes all constraints', () => { const prompt = experimentPrompt(constraints, [10, 10, 20, 20]); for (const c of constraints) assert.ok(prompt.includes(c.text)); assert.equal(digest(prompt), digest(experimentPrompt(structuredClone(constraints), [10, 10, 20, 20]))); });

test('editing coordinates use official normalized bbox syntax on a non-square target', () => { assert.ok(experimentPrompt(constraints, [100, 50, 200, 100], 1000, 500).includes('<bbox>100 100 200 200</bbox>')); });
