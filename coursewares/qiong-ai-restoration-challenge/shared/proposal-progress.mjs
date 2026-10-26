import { DEFAULT_CASE_ID, restorationCase, proposalCase } from './restoration-cases.mjs';
import { preparationEvidence } from './preparation-evidence.mjs';
export function validateProposalDraft(value) {
  if (!value || !restorationCase(value.caseId === undefined ? DEFAULT_CASE_ID : value.caseId) || value.version !== 2 || !Number.isInteger(value.step) || value.step < 0 || value.step > 2 ||
    typeof value.ownerId !== 'string' || !Array.isArray(value.clueIds) || value.clueIds.length > 3 || new Set(value.clueIds).size !== value.clueIds.length ||
    !value.clueIds.every(id => typeof id === 'string' && id.length <= 80) || typeof value.proposalText !== 'string' || value.proposalText.length > 500 ||
    typeof value.maskDataUrl !== 'string' || value.maskDataUrl.length > 2e6 || value.maskDataUrl && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.maskDataUrl) ||
    value.proposalId != null && (typeof value.proposalId !== 'string' || value.proposalId.length > 80)) throw new Error('这不是有效的三步版进度包，原有草稿未改变');
  return { version: 2, caseId:value.caseId || DEFAULT_CASE_ID, ownerId: value.ownerId, resetVersion: Number.isSafeInteger(value.resetVersion) ? value.resetVersion : 0, step: value.step,
    clueIds: [...value.clueIds], proposalText: value.proposalText, maskDataUrl: value.maskDataUrl, proposalId: value.proposalId || null,
    requestId: typeof value.requestId === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(value.requestId) ? value.requestId : null, startedAt: Number.isFinite(value.startedAt) ? value.startedAt : Date.now() };
}
export function restoreProposalDraft(value, session, explicitImport = false) {
  const draft = validateProposalDraft(value);
  if (draft.ownerId !== session.ownerId) throw new Error('进度包不属于当前学生和任务');
  if (!explicitImport && draft.resetVersion !== session.resetVersion) throw new Error('课堂已重新开始，旧草稿不会自动恢复');
  const proposal = session.proposals.find(p => p.id === draft.proposalId);
  const available = preparationEvidence(session.assets).clues;
  if (!proposal && draft.clueIds.some(id => !available.some(a => a.id === id))) throw new Error('部分线索已不在本次准备中，请先重新选择线索');
  return { ...draft, resetVersion: session.resetVersion, proposalId: proposal?.id || null,
    requestId: !proposal && (draft.proposalId || draft.resetVersion !== session.resetVersion) ? null : draft.requestId,
    step: proposal ? draft.step : Math.min(draft.step, 1),
    ...(proposal ? { caseId:proposalCase(proposal).id, clueIds: proposal.snapshot.clueIds, proposalText: proposal.snapshot.proposalText, maskDataUrl: proposal.maskDataUrl } : {}) };
}
