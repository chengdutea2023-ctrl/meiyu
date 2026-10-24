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
  const ports = [];
  for (const item of mapping.coursewares) {
    const dynamic = catalog.coursewares.find(c => c.slug === item.sourceSlug).runtimeType !== 'STATIC';
    assert.equal(Boolean(item.nodePort), dynamic, `Runtime port does not match ${item.sourceSlug}`);
    if (dynamic) { assert.ok(Number.isInteger(item.nodePort) && item.nodePort >= 1024 && item.nodePort <= 65535); ports.push(item.nodePort); }
  }
  assert.equal(new Set(ports).size, ports.length, 'Dynamic lessons must not share ports');
});
