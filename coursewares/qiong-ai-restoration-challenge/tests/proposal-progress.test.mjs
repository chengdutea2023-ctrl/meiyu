import test from 'node:test';
import assert from 'node:assert/strict';
import {validateProposalDraft,restoreProposalDraft} from '../shared/proposal-progress.mjs';
import {preparationEvidence,clueLabel} from '../shared/preparation-evidence.mjs';
const draft={version:2,ownerId:'owner',resetVersion:1,step:2,clueIds:['clue-1'],proposalText:'我想把罐口修成外翻的圆口。',maskDataUrl:'',proposalId:'proposal-1',requestId:'proposal-request-12345678',startedAt:123};
const session={ownerId:'owner',resetVersion:1,assets:[{id:'clue-1',role:'clue'}],proposals:[]};
test('versioned local drafts never restore another owner or reset generation, while explicit import restores text without inventing AI',()=>{
  const value=validateProposalDraft({...draft,saved:true,launchToken:'secret'});assert.equal(value.saved,undefined);assert.equal(value.launchToken,undefined);assert.equal(value.requestId,draft.requestId);
  assert.throws(()=>restoreProposalDraft(draft,{...session,ownerId:'other'}),/不属于/);assert.throws(()=>restoreProposalDraft(draft,{...session,resetVersion:2}),/重新开始/);
  const imported=restoreProposalDraft(draft,{...session,resetVersion:2},true);assert.equal(imported.step,1);assert.equal(imported.proposalId,null);assert.equal(imported.requestId,null);assert.equal(imported.proposalText,draft.proposalText);assert.equal(imported.resetVersion,2);
  assert.equal(restoreProposalDraft({...draft,proposalId:null},session).requestId,draft.requestId,'a lost creation response keeps its idempotency key');
  assert.throws(()=>validateProposalDraft({...draft,version:1}),/三步版/);assert.throws(()=>validateProposalDraft({...draft,clueIds:['a','a']}),/三步版/);assert.throws(()=>validateProposalDraft({...draft,maskDataUrl:'javascript:alert(1)'}),/三步版/);
});
test('restoring an owned proposal uses its frozen clues, text and mask',()=>{const proposal={id:'proposal-1',snapshot:{clueIds:['clue-1'],proposalText:'服务器保存的方案'},maskDataUrl:''};const restored=restoreProposalDraft({...draft,proposalText:'旧本机文字'},{...session,proposals:[proposal]});assert.equal(restored.proposalText,proposal.snapshot.proposalText);assert.equal(restored.step,2);assert.equal(restored.proposalId,proposal.id);});
test('old teacher material is hidden, old student roles remain usable clues without rewriting the original assets',()=>{
 const assets=[...Array.from({length:8},(_,i)=>({id:'legacy-'+i,builtinId:'builtin-'+i,role:'excluded'})),{id:'one',role:'reference'},{id:'two',role:'holdout'},{id:'three',role:'clue'},{id:'four',role:'excluded'}],before=structuredClone(assets),e=preparationEvidence(assets);
 assert.equal(e.clues.length,3);assert.equal(e.legacy.length,8);assert.equal(e.counts.active,3);assert.equal(e.own.length,4);assert.equal(clueLabel(assets[9],assets),'线索2');assert.deepEqual(assets,before);
});
