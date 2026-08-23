import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isForbiddenRelativePath,
  validateCatalog,
  validateManifestShape,
} from './courseware-release.mjs';

test('all seven canonical coursewares pass package validation', async () => {
  const result = await validateCatalog();
  assert.equal(result.coursewares.length, 7);
  assert.equal(new Set(result.coursewares.map((item) => item.slug)).size, 7);
});

test('runtime state, user data, dependencies, and secrets are rejected', () => {
  const forbidden = [
    'server/data/work.json',
    'server/node_modules/pkg/index.js',
    '.runtime/node.pid',
    'server/.env',
    'static/debug.log',
    '.codex-backups/old/manifest.json',
  ];
  for (const relativePath of forbidden) {
    assert.equal(isForbiddenRelativePath(relativePath), true, relativePath);
  }
  assert.equal(isForbiddenRelativePath('static/assets/data-chart.png'), false);
});

test('manifest contract catches slug and runtime mismatches', () => {
  const errors = validateManifestShape(
    { slug: 'wrong', title: 'Demo', runtimeType: 'NODE', entry: '/', nodePort: null },
    { slug: 'expected', title: 'Expected title', runtimeType: 'STATIC' },
  );
  assert.ok(errors.some((error) => error.includes('manifest.slug')));
  assert.ok(errors.some((error) => error.includes('manifest.title')));
  assert.ok(errors.some((error) => error.includes('目录清单一致')));
});
