import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('runtime reconciliation is read-only by default and preserves data on apply', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'zhike-sync-test-'));
  try {
    for (const dir of ['repo/scripts', 'repo/ops', 'repo/coursewares/demo/static', 'runtime/course/coursewares/legacy/.runtime']) {
      await mkdir(path.join(temp, dir), { recursive: true });
    }
    await cp(new URL('./courseware-sync.mjs', import.meta.url), path.join(temp, 'repo/scripts/courseware-sync.mjs'));
    await writeFile(path.join(temp, 'repo/ops/courseware-deployments.json'), JSON.stringify({ courseSlug: 'course', coursewares: [{ sourceSlug: 'demo', runtimeSlug: 'legacy' }] }));
    await writeFile(path.join(temp, 'repo/coursewares/catalog.json'), JSON.stringify({ coursewares: [{ slug: 'demo' }] }));
    await writeFile(path.join(temp, 'repo/coursewares/demo/manifest.json'), JSON.stringify({ slug: 'demo', title: 'Demo' }));
    await writeFile(path.join(temp, 'repo/coursewares/demo/static/index.html'), 'new');
    const destination = path.join(temp, 'runtime/course/coursewares/legacy');
    await mkdir(path.join(destination, 'static'));
    await writeFile(path.join(destination, 'static/index.html'), 'old');
    await writeFile(path.join(destination, '.runtime/env.json'), 'private');
    const run = (...args) => spawnSync(process.execPath, [path.join(temp, 'repo/scripts/courseware-sync.mjs'), '--root', path.join(temp, 'runtime'), ...args], { encoding: 'utf8' });
    assert.equal(run().status, 1);
    assert.equal(await readFile(path.join(destination, 'static/index.html'), 'utf8'), 'old');
    assert.notEqual(run('--apply').status, 0);
    const applied = run('--apply', '--backup', path.join(temp, 'backup'));
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(await readFile(path.join(destination, 'static/index.html'), 'utf8'), 'new');
    assert.equal(await readFile(path.join(destination, '.runtime/env.json'), 'utf8'), 'private');
    assert.equal(await readFile(path.join(temp, 'backup/course/legacy/static/index.html'), 'utf8'), 'old');
    assert.equal(JSON.parse(await readFile(path.join(destination, 'manifest.json'))).slug, 'legacy');
    assert.equal(run().status, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
