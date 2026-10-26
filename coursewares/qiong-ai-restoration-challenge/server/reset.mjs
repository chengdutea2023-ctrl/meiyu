import { randomUUID } from 'node:crypto';
import { requireValue } from './domain.mjs';
import { preparationDigest } from './preparation.mjs';

export const resetVersion = owner => owner.resetVersion || 0;
const running = owner => owner.tasks.some(task => task.results.some(result => ['pending', 'running'].includes(result.state))) || (owner.evidenceJobs||[]).some(j=>['pending','running'].includes(j.state));
export function assertResetVersion(req, owner) {
  const supplied = req.headers['x-lesson-version'];
  requireValue((supplied === undefined && resetVersion(owner) === 0) || String(resetVersion(owner)) === supplied,
    '课件已在其他页面重置，请重新进入后继续，原有记录已保留', 'LESSON_RESET', 409);
}
export function resetInfo(owner) {
  const previous = owner.resetHistory?.find(item => item.id === owner.lastResetId);
  return { resetVersion: resetVersion(owner), canReset: !running(owner), canUndoReset: Boolean(previous && !previous.restored && !owner.tasks.length && previous.evidenceDigest === preparationDigest(owner.assets)), lastResetId: owner.lastResetId || null };
}

export async function resetLesson(req, owner, requestId, persist) {
  requireValue(/^[a-zA-Z0-9-]{16,80}$/.test(requestId || ''), '重置请求编号无效');
  const previous = owner.resetHistory?.find(item => item.requestId === requestId);
  if (previous) {
    requireValue(previous.id === owner.lastResetId && !previous.restored, '这次重置请求已处理，请重新读取课件', 'LESSON_RESET', 409);
    return previous.id;
  }
  assertResetVersion(req, owner);
  requireValue(!running(owner), '实验正在生成，请等待生成结束后再重置', 'EXPERIMENT_RUNNING', 409);
  const archive = { id: randomUUID(), requestId, createdAt: Date.now(), evidenceDigest: preparationDigest(owner.assets), tasks: structuredClone(owner.tasks), restored: false };
  const next = { ...owner, tasks: [], resetVersion: resetVersion(owner) + 1, lastResetId: archive.id, resetHistory: [...(owner.resetHistory || []), archive] };
  // A single atomic state write keeps the old active experiment intact if saving fails.
  await persist(next); Object.assign(owner, next);
  return archive.id;
}

export async function undoLessonReset(req, owner, requestId, persist) {
  requireValue(/^[a-zA-Z0-9-]{16,80}$/.test(requestId || ''), '恢复请求编号无效');
  if (owner.lastUndoRequestId === requestId) return;
  assertResetVersion(req, owner);
  requireValue(resetInfo(owner).canUndoReset, '已有新实验或资料已改变，不能覆盖当前进度；原实验仍保留存档', 'RESET_UNDO_UNAVAILABLE', 409);
  const archive = owner.resetHistory.find(item => item.id === owner.lastResetId);
  const next = { ...owner, tasks: structuredClone(archive.tasks), resetVersion: resetVersion(owner) + 1, lastUndoRequestId: requestId,
    resetHistory: owner.resetHistory.map(item => item.id === archive.id ? { ...item, restored: true } : item) };
  await persist(next); Object.assign(owner, next);
}
