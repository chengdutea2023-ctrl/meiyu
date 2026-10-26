import { packZip, unpackZip, jsonBytes } from './io';
import { media } from './platform';
import { restorationCase, proposalCase } from '../shared/restoration-cases.mjs';
import { validateProposalDraft } from '../shared/proposal-progress.mjs';
export { validateProposalDraft, restoreProposalDraft } from '../shared/proposal-progress.mjs';

export function readProposalProgress(bytes) {
  const files = unpackZip(bytes);
  if (!files['progress.json']) throw new Error('进度包缺少三步版进度记录');
  const value = JSON.parse(new TextDecoder().decode(files['progress.json']));
  if (value.version === 1) throw new Error('这是旧版实验进度；旧作品仍保留，新版请重新填写一句复原方案');
  return validateProposalDraft(value);
}
export async function proposalPackage({ draft, proposal, assets }) {
  const files = { 'progress.json': jsonBytes(validateProposalDraft(draft)) };
  const selected = proposal?.snapshot.evidence || assets.filter(a => draft.clueIds.includes(a.id));
  files['我的线索.json'] = jsonBytes({ workflowVersion: 2, teachingSimulation: true, case:proposal?proposalCase(proposal):restorationCase(draft.caseId), clues: selected });
  if (proposal) files['复原方案.json'] = jsonBytes(proposal);
  if (draft.maskDataUrl) files['mask.png'] = Uint8Array.from(atob(draft.maskDataUrl.split(',')[1]), c => c.charCodeAt(0));
  for (const clue of selected) files[`images/${clue.id}.png`] = new Uint8Array(await (await fetch(await media(clue.id))).arrayBuffer());
  const result = proposal?.results.find(r => r.state === 'succeeded');
  if (result) files['results/AI复原候选.png'] = new Uint8Array(await (await fetch(await media(result.fileId))).arrayBuffer());
  return new Blob([packZip(files)], { type: 'application/zip' });
}
