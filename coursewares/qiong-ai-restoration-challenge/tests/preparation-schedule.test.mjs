import test from 'node:test';
import assert from 'node:assert/strict';
import { preparationAccess, beijingInput, beijingTimestamp } from '../shared/preparation-schedule.mjs';
import { assertApproved, preparationDigest } from '../server/preparation.mjs';
const opensAt='2026-10-24T01:00:00.000Z',closesAt='2026-10-25T01:00:00.000Z';
test('preparation windows open exactly at the start and reject writes at the deadline; legacy switches remain compatible',()=>{
 const settings={enabled:true,opensAt,closesAt};
 assert.equal(preparationAccess(settings,{},Date.parse(opensAt)-1).status,'NOT_STARTED');
 assert.equal(preparationAccess(settings,{},Date.parse(opensAt)).open,true);
 assert.equal(preparationAccess(settings,{},Date.parse(closesAt)-1).open,true);
 assert.equal(preparationAccess(settings,{},Date.parse(closesAt)).status,'CLOSED');
 assert.equal(preparationAccess({enabled:true}).open,true);
 assert.equal(preparationAccess({enabled:false}).open,false);
 assert.equal(preparationAccess({enabled:true,opensAt:'invalid'}).open,false);
});
test('supplement windows override only that student’s preparation cutoff and never remove the approval requirement',()=>{
 const now=Date.parse(closesAt),until='2026-10-26T01:00:00.000Z',owner={assets:[],preparation:{status:'RETURNED'},preparationExtension:{until}};
 assert.equal(preparationAccess({enabled:false},owner,now).status,'SUPPLEMENT');
 assert.equal(preparationAccess({enabled:false},{},now).open,false);
 assert.equal(preparationAccess({enabled:false},owner,Date.parse(until)).open,false);
 assert.throws(()=>assertApproved(owner));
 owner.preparation.status='APPROVED';owner.preparation.evidenceDigest=preparationDigest(owner.assets);
 assert.equal(preparationAccess({enabled:false},owner,now).open,false);
 assert.doesNotThrow(()=>assertApproved(owner));
 owner.assets.push({id:'changed'});assert.throws(()=>assertApproved(owner));
});
test('teacher date controls round trip Beijing time independently of device timezone',()=>{
 assert.equal(beijingInput(opensAt),'2026-10-24T09:00');
 assert.equal(beijingTimestamp('2026-10-24T09:00'),opensAt);
 assert.equal(beijingTimestamp(''),null);
 assert.equal(beijingInput(null),'');
 assert.throws(()=>beijingTimestamp('not-a-date'));
});
