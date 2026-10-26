import test from 'node:test';
import assert from 'node:assert/strict';
import {readTestAllowance,totalRequestLimit,requestBudgetIssue} from '../server/test-allowance.mjs';
import {proposalAllowance} from '../shared/proposal-generation.mjs';
const ownerId='a'.repeat(40),otherId='b'.repeat(40),grant={ownerId,proposalLimit:15,extraRequests:12};
test('private test grants are finite, validated and cannot silently remove the existing paid cap',()=>{
 assert.equal(readTestAllowance('',9),null);assert.deepEqual(readTestAllowance(JSON.stringify(grant),9),grant);
 for(const input of ['broken','null','[]',JSON.stringify({...grant,ownerId:'wrong'}),JSON.stringify({...grant,extraRequests:0}),JSON.stringify({...grant,extraRequests:101}),JSON.stringify({...grant,proposalLimit:Infinity})])assert.throws(()=>readTestAllowance(input,9));
 assert.throws(()=>readTestAllowance(JSON.stringify(grant),0));assert.equal(totalRequestLimit(9,grant),21);assert.equal(totalRequestLimit(9,null),9);assert.equal(totalRequestLimit(0,null),0);
});
test('the extra twelve paid requests belong only to the authorized task, including retries and reset',()=>{
 for(let count=9;count<21;count++){assert.equal(requestBudgetIssue(count,9,grant,ownerId),'');assert.equal(requestBudgetIssue(count,9,grant,otherId),'TEST_ALLOWANCE_SCOPE');assert.equal(requestBudgetIssue(count,9,grant,undefined),'TEST_ALLOWANCE_SCOPE');}
 assert.equal(requestBudgetIssue(21,9,grant,ownerId),'TEST_BUDGET_REACHED');assert.equal(requestBudgetIssue(9,9,null,ownerId),'TEST_BUDGET_REACHED');assert.equal(requestBudgetIssue(8,9,grant,otherId),'');
 const owner={proposalGenerationCount:3,tasks:[],resetHistory:[]};assert.deepEqual(proposalAllowance(owner,15),{used:3,limit:15,remaining:12});assert.deepEqual(proposalAllowance(owner),{used:3,limit:3,remaining:0});
 for(const invalid of [0,-1,Infinity,101,'15'])assert.deepEqual(proposalAllowance(owner,invalid),{used:3,limit:3,remaining:0});
});
