import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const { scripts } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const catalog = JSON.parse(await readFile(new URL('coursewares/incoming-qiong.json', root), 'utf8'));
const mapping = JSON.parse(await readFile(new URL('ops/qiong-courseware-deployments.json', root), 'utf8'));

test('Qiong group commands cover all three lessons exactly once without recursive aliases', () => {
  for (const action of ['build', 'test', 'package']) {
    const expected = ['kiln', 'vision', 'restoration'].map(name => `npm run coursewares:${name}:${action}`);
    assert.deepEqual(scripts[`coursewares:qiong:${action}`].split(' && '), expected);
    for (const name of ['kiln', 'vision', 'restoration']) {
      assert.ok(scripts[`coursewares:${name}:${action}`]);
      assert.equal(scripts[`coursewares:${name}:${action}`].includes('coursewares:qiong:'), false);
    }
  }
});

test('the three independent runtime identities match their source catalog and unique destinations', () => {
  assert.equal(catalog.coursewares.length, 3);
  assert.equal(mapping.coursewares.length, 3);
  assert.deepEqual(new Set(catalog.coursewares.map(item => item.slug)), new Set(mapping.coursewares.map(item => item.sourceSlug)));
  assert.equal(new Set(mapping.coursewares.map(item => item.runtimeSlug)).size, 3);
  assert.equal(mapping.coursewares.filter(item => item.nodePort).length, 1);
});
