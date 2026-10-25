import test from 'node:test';
import assert from 'node:assert/strict';
import { proposalImage, proposalCompletionIssue, reusableProposals } from '../shared/proposal-completion.mjs';
const success={id:'success',aiState:'succeeded',results:[{state:'succeeded',fileId:'image'}],snapshot:{preparation:{evidenceDigest:'current'}}};

test('only a successful image unlocks display and submission; mock results are restricted to demo',()=>{
  for(const aiState of ['not_requested','pending','running','failed','unknown']) assert.ok(proposalCompletionIssue({aiState,results:[]}));
  assert.ok(proposalCompletionIssue({...success,results:[{state:'succeeded'}]}));
  assert.equal(proposalCompletionIssue(success),'');assert.equal(proposalImage(success).fileId,'image');
  assert.ok(proposalCompletionIssue({...success,mocked:true}));assert.equal(proposalCompletionIssue({...success,mocked:true},true),'');
});

test('reuse keeps the complete owned plan and excludes stale approval, failed and mocked results',()=>{
  const stale={...success,id:'stale',snapshot:{preparation:{evidenceDigest:'old'}}},failed={...success,id:'failed',aiState:'failed',results:[]},mock={...success,id:'mock',mocked:true};
  const session={preparation:{status:'APPROVED',evidenceDigest:'current'},proposals:[success,stale,failed,mock]};
  assert.deepEqual(reusableProposals(session),[success]);
  assert.deepEqual(reusableProposals({...session,preparation:{status:'SUBMITTED',evidenceDigest:'current'}}),[]);
});
