import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const assets = new URL('../public/assets/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('specimens.json', assets), 'utf8'));

test('the four added objects retain provenance and remain observation material', async () => {
  assert.equal(catalog.length, 11);
  assert.equal(new Set(catalog.map(s => s.id)).size, catalog.length);
  const added = catalog.filter(s => s.added);
  assert.equal(added.length, 4);
  assert.deepEqual(added.map(s => s.label).sort(), ['壶', '壶', '碗', '罐'].sort());
  const hashes = new Set();
  for (const item of catalog) {
    assert.ok(item.era && item.museum && item.description.length >= 20);
    assert.match(item.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File/);
    assert.ok(item.author && item.license && item.licenseUrl);
    const photo = await readFile(new URL(item.file, assets));
    assert.equal(photo.readUInt16BE(0), 0xffd8, item.file);
    assert.ok(photo.length > 10000, item.file);
    const hash = createHash('sha256').update(photo).digest('hex');
    assert.ok(!hashes.has(hash), `Duplicate photo: ${item.file}`);
    hashes.add(hash);
  }
  const model = JSON.parse(await readFile(new URL('../public/models/model-card.json', import.meta.url), 'utf8'));
  for (const item of added) {
    assert.equal(item.split, 'observation');
    assert.equal(item.challenge, false);
    assert.ok(!model.sources.some(s => s.id === item.id));
    assert.ok(!model.validation.some(s => s.id === item.id));
  }
});
