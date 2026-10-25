import test from 'node:test';
import assert from 'node:assert/strict';
import { resetLesson, undoLessonReset, resetInfo, assertResetVersion } from '../server/reset.mjs';
import { preparationDigest, assertApproved } from '../server/preparation.mjs';

const request = version => ({ headers: version === undefined ? {} : { 'x-lesson-version': String(version) } });
function fixture(state = 'succeeded') {
  const assets = [{ id: 'reference-photo', role: 'reference', usedInGeneration: true, source: '学生实拍', feature: '外翻口沿' }, { id: 'holdout-photo', role: 'holdout' }];
  return { id: 'isolated-test-owner', assets, holdoutFrozen: ['holdout-photo'], tasks: [{ id: 'old-experiment', requestId: 'old-experiment-request', results: [{ state, fileId: 'old-result' }], review: { conclusion: '旧审查结论' } }],
    preparation: { status: 'APPROVED', revision: 7, teacherId: 'teacher', evidenceDigest: preparationDigest(assets) } };
}
test('reset archives experiments atomically, preserves approved evidence and never changes a cost counter', async () => {
  const owner = fixture(), original = structuredClone(owner); let persisted, count = 6;
  const persist = async value => { persisted = structuredClone(value); };
  const id = await resetLesson(request(0), owner, 'reset-idempotent-request-123', persist);
  assert.equal(owner.resetVersion, 1); assert.deepEqual(owner.tasks, []);
  assert.deepEqual(owner.assets, original.assets); assert.deepEqual(owner.preparation, original.preparation);
  assert.deepEqual(owner.holdoutFrozen, original.holdoutFrozen); assert.doesNotThrow(() => assertApproved(owner));
  assert.deepEqual(owner.resetHistory[0].tasks, original.tasks); assert.deepEqual(persisted, owner); assert.equal(count, 6);
  assert.equal(await resetLesson(request(0), owner, 'reset-idempotent-request-123', persist), id);
  assert.equal(owner.resetVersion, 1); assert.equal(owner.resetHistory.length, 1);
  assert.throws(() => assertResetVersion(request(0), owner), { code: 'LESSON_RESET' });
  assert.throws(() => assertResetVersion(request(), owner), { code: 'LESSON_RESET' });
  assert.doesNotThrow(() => assertResetVersion(request(1), owner));
  assert.equal(resetInfo(owner).canUndoReset, true);
  await undoLessonReset(request(1), owner, 'restore-idempotent-request-123', persist);
  assert.deepEqual(owner.tasks, original.tasks); assert.equal(owner.resetVersion, 2); assert.equal(resetInfo(owner).canUndoReset, false);
  await undoLessonReset(request(1), owner, 'restore-idempotent-request-123', persist);
  assert.equal(owner.resetVersion, 2);
});
test('failed persistence and in-flight results preserve the exact existing progress', async () => {
  const owner = fixture(), before = structuredClone(owner);
  await assert.rejects(resetLesson(request(), owner, 'failed-storage-request-123', async () => { throw Error('disk full'); }), /disk full/);
  assert.deepEqual(owner, before);
  for (const state of ['pending', 'running']) {
    const active = fixture(state), snapshot = structuredClone(active);
    await assert.rejects(resetLesson(request(), active, 'running-experiment-request', async () => assert.fail('must not write')), { code: 'EXPERIMENT_RUNNING' });
    assert.deepEqual(active, snapshot);
  }
});
test('restore cannot overwrite a newer experiment or changed evidence', async () => {
  for (const change of [owner => owner.tasks.push({ id: 'new', results: [] }), owner => owner.assets[0].feature = '新资料说明']) {
    const owner = fixture(); await resetLesson(request(), owner, 'reset-before-restore-request', async () => {});
    change(owner); const before = structuredClone(owner);
    await assert.rejects(undoLessonReset(request(1), owner, 'restore-blocked-request-123', async () => assert.fail('must not write')), { code: 'RESET_UNDO_UNAVAILABLE' });
    assert.deepEqual(owner, before);
  }
});
