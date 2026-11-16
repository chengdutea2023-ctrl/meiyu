import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('admin lists retain older teachers after more than 100 users register', async () => {
  const { default: { UsersService } } = await import('../platform/api/dist/modules/users/users.service.js');
  const users = Array.from({ length: 120 }, (_, index) => ({
    id: 'user-' + index,
    email: 'user-' + index + '@example.invalid',
    displayName: index === 0 ? '早期教师' : '学生' + index,
    userType: index === 0 ? 'TEACHER' : 'STUDENT',
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    isPlatformAdmin: false,
    createdAt: new Date(index * 1000),
    updatedAt: new Date(index * 1000),
    deletedAt: null,
    passwordHash: 'private-test-field',
    organizations: [],
    classes: [],
  }));
  users.push({ ...users[0], id: 'deleted-teacher', deletedAt: new Date() });
  const service = new UsersService({
    user: {
      findMany: async ({ where, orderBy, take }) => {
        assert.equal(where.deletedAt, null);
        assert.equal(orderBy.createdAt, 'desc');
        return users.filter(user => user.deletedAt === null)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, take);
      },
    },
  });
  const result = await service.findMany();
  assert.equal(result.length, 120);
  assert.equal(result.at(-1).displayName, '早期教师');
  assert.ok(result.some(user => user.userType === 'TEACHER' && user.status === 'ACTIVE' && user.approvalStatus === 'APPROVED'));
  assert.ok(result.every(user => !('passwordHash' in user)));
  assert.ok(!result.some(user => user.id === 'deleted-teacher'));
});

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
    await writeFile(path.join(temp, 'repo/ops/birds.json'), JSON.stringify({ courseSlug: 'bird-course', coursewares: [{ sourceSlug: 'demo', runtimeSlug: 'bird-demo' }] }));
    await writeFile(path.join(temp, 'repo/coursewares/birds.json'), JSON.stringify({ coursewares: [{ slug: 'demo' }] }));
    const birdArgs = ['--mapping', 'ops/birds.json', '--catalog', 'coursewares/birds.json'];
    assert.equal(run(...birdArgs).status, 1);
    assert.equal(run(...birdArgs, '--apply', '--backup', path.join(temp, 'bird-backup')).status, 0);
    assert.equal(run(...birdArgs).status, 0);
    assert.equal(await readFile(path.join(temp, 'runtime/bird-course/coursewares/bird-demo/static/index.html'), 'utf8'), 'new');
    assert.equal(await readFile(path.join(destination, '.runtime/env.json'), 'utf8'), 'private');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
