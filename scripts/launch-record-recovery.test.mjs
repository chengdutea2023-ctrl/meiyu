import test from 'node:test';
import assert from 'node:assert/strict';
import runtimeModule from '../platform/api/dist/modules/course-runtime/course-runtime.service.js';
const { CourseRuntimeService } = runtimeModule;

function fixture(record = null) {
  const session = { id: 'launch', studentId: 'student', courseId: 'course', coursewareId: 'ware', assignmentId: 'assignment', classId: 'class' };
  const queries = [];
  return { queries, fake: {
    findValidLaunchSession: async () => session,
    launchSessionInclude: () => ({}),
    prisma: {
      courseLaunchSession: { update: async () => session },
      learningRecord: { findFirst: async query => { queries.push(query); return record; } },
    },
    toLaunchContext: value => ({ launchSessionId: value.id }),
    toArtifact: CourseRuntimeService.prototype.toArtifact,
  } };
}
test('launch recovery reads only the exact validated student, assignment, class and courseware', async () => {
  const { fake, queries } = fixture();
  const result = await CourseRuntimeService.prototype.verifyLaunch.call(fake, 'opaque');
  assert.equal(result.record, null);
  assert.deepEqual(queries[0].where, { studentId: 'student', courseId: 'course', coursewareId: 'ware', assignmentId: 'assignment', classId: 'class' });
  assert.equal(result.context.launchSessionId, 'launch');
});
test('launch recovery exposes completion and public artifact metadata, never private paths', async () => {
  const { fake, queries } = fixture({ id: 'record', status: 'COMPLETED', score: null, summary: { experimentId: 'experiment' }, completedAt: new Date(),
    passwordHash: 'must-not-leak', artifacts: [{ id: 'file', kind: 'final-work', fileName: 'file.png', originalFileName: 'report.png', mimeType: 'image/png', sizeBytes: 12, publicUrl: '/artifact/file', metadata: { experimentId: 'experiment' }, createdAt: new Date(), storagePath: '/private/path' }] });
  const result = await CourseRuntimeService.prototype.verifyLaunch.call(fake, 'opaque');
  assert.equal(result.record.status, 'COMPLETED');
  assert.equal(result.record.score, null);
  assert.equal(result.record.artifacts[0].url, '/artifact/file');
  assert.equal(result.record.artifacts[0].metadata.experimentId, 'experiment');
  assert.doesNotMatch(JSON.stringify(result), /private\/path|must-not-leak|storagePath|passwordHash/);
  assert.equal(queries[0].select.artifacts.select.storagePath, undefined);
});
test('expired or closed launches cannot read a saved record', async () => {
  const { fake, queries } = fixture();
  fake.findValidLaunchSession = async () => { throw new Error('launch expired'); };
  await assert.rejects(CourseRuntimeService.prototype.verifyLaunch.call(fake, 'expired'), /expired/);
  assert.equal(queries.length, 0);
});
