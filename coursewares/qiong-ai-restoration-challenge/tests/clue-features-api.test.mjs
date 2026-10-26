import test from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import sharp from 'sharp';
const dir=await mkdtemp(join(tmpdir(),'qiong-linked-features-'));
Object.assign(process.env,{ALLOW_LOCAL_DEMO:'1',AI_TEST_MOCK:'1',AI_MAX_REQUESTS:'5',EVIDENCE_MAX_REQUESTS_PER_TASK:'12',COURSEWARE_DATA_DIR:dir,PORT:'0',MOCK_DELAY_MS:'30'});delete process.env.COURSEWARE_ENV_FILE;delete process.env.ARK_API_KEY;delete process.env.ARK_EVIDENCE_API_KEY;delete process.env.EVIDENCE_TEST_FAIL;delete process.env.EVIDENCE_TEST_UNKNOWN;
const {server}=await import('../server/server.js');if(!server.listening)await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}/api/`;
async function call(path,value,version=0,id='feature-local-student-123456'){const r=await fetch(base+path,{method:value===undefined?'GET':'POST',headers:{'content-type':'application/json','x-demo-id':id,'x-lesson-version':String(version)},body:value===undefined?undefined:JSON.stringify(value)});return{status:r.status,body:await r.json()};}
async function settled(path,key){for(let i=0;i<200;i++){const r=await call(path),v=r.body[key];if(!['pending','running'].includes(v?.state||v?.aiState))return v;await new Promise(r=>setTimeout(r,10));}throw Error('did not settle');}
test('recognize, confirm an adopted trait, generate one image and check that same trait, without leaking unadopted clues',async()=>{try{
 const clues=[];for(const color of ['#8a7222','#339988','#c2bca1']){const bytes=await sharp({create:{width:120,height:120,channels:3,background:color}}).png().toBuffer();const r=await call('assets',{dataUrl:'data:image/png;base64,'+bytes.toString('base64'),role:'clue',source:'隔离测试来源',feature:'我发现了口沿细节'});clues.push(r.body.asset);}
 const input={kind:'analysis',requestId:'analysis-local-request-123456',caseId:'four-ear-jar',clueIds:clues.map(a=>a.id)};
 const results=await Promise.all([call('evidence-jobs',input),call('evidence-jobs',input)]);assert.equal(results[0].body.job.id,results[1].body.job.id);
 const analysis=await settled('evidence-jobs/'+results[0].body.job.id,'job');assert.equal(analysis.state,'succeeded');assert.equal(analysis.items.length,3);assert.equal(analysis.items[2].relevance,'unclear');
 assert.equal((await call('health')).body.evidence.requestsUsed,1);
 assert.equal((await call('evidence-jobs',{...input,requestId:'another-analysis-id-12345'})).body.job.id,analysis.id,'same source and target is cached');
 assert.equal((await call('evidence-jobs/'+analysis.id,undefined,0,'feature-other-student-1234')).status,404);
 const item=analysis.items[0],feature={clueId:clues[0].id,part:item.part,feature:item.feature,region:item.region,origin:'ai_confirmed',analysisId:analysis.id};
 const planInput={requestId:'linked-plan-request-123456',caseId:'four-ear-jar',clueIds:clues.map(a=>a.id),proposalText:'学生试图覆盖特征的旧提示词',featureWorkflow:1,featureSelections:[feature],creativeText:'尝试黄金材料'};
 const invalid=await call('proposals',{...planInput,requestId:'bad-feature-plan-123456',featureSelections:[]});assert.equal(invalid.status,400);
 const created=await call('proposals',planInput);assert.equal(created.status,201);let proposal=created.body.proposal;
 assert.deepEqual(proposal.snapshot.clueIds,[clues[0].id]);assert.equal(proposal.snapshot.evidence.length,1);assert.match(proposal.snapshot.proposalText,/参照线索1/);assert.doesNotMatch(proposal.snapshot.proposalText,/试图覆盖/);assert.match(proposal.snapshot.proposalText,/我的创意：尝试黄金材料/);
 assert.match(proposal.snapshot.prompt,/必须采用的视觉特征/);assert.equal(proposal.snapshot.featureSelections[0].analysisId,analysis.id);
 assert.equal((await call('evidence-jobs',{kind:'check',requestId:'premature-check-123456',proposalId:proposal.id})).status,400);
 await call('proposals/'+proposal.id+'/generate',{});proposal=await settled('proposals/'+proposal.id,'proposal');assert.equal(proposal.aiState,'succeeded');assert.equal(proposal.results[0].referenceCount,1);assert.deepEqual(proposal.results[0].inputHashes,[proposal.snapshot.targetHash,clues[0].hash]);
 const checkInput={kind:'check',requestId:'feature-check-request-123456',proposalId:proposal.id};const checked=await Promise.all([call('evidence-jobs',checkInput),call('evidence-jobs',checkInput)]);assert.equal(checked[0].body.job.id,checked[1].body.job.id);
 const check=await settled('evidence-jobs/'+checked[0].body.job.id,'job');assert.equal(check.state,'succeeded');assert.equal(check.items.length,1);assert.equal(check.items[0].clueId,feature.clueId);assert.equal(check.items[0].status,'unclear');
 const fresh=(await call('proposals/'+proposal.id)).body.proposal;assert.equal(fresh.featureCheck.id,check.id);assert.equal((await call('session')).body.proposals[0].featureCheck.id,check.id);
 assert.equal((await call('health')).body.requestsUsed,1);assert.equal((await call('health')).body.evidence.requestsUsed,2);
 // Active vision prevents reset; timeout is not a failed job and cannot create a duplicate request.
 process.env.EVIDENCE_TEST_UNKNOWN='1';const next=await call('evidence-jobs',{...input,caseId:'song-bowl',requestId:'unknown-vision-request-1234'});
 assert.equal((await call('reset',{requestId:'busy-reset-request-123456'})).status,409);
 const unknown=await settled('evidence-jobs/'+next.body.job.id,'job');assert.equal(unknown.state,'unknown');
 assert.equal((await call('evidence-jobs/'+unknown.id+'/retry',{})).status,400);
 assert.equal((await call('evidence-jobs',{...input,caseId:'song-bowl',requestId:'unknown-duplicate-123456'})).body.job.id,unknown.id);delete process.env.EVIDENCE_TEST_UNKNOWN;
 process.env.EVIDENCE_TEST_FAIL='1';const failStart=await call('evidence-jobs',{...input,caseId:'brown-ewer',requestId:'failed-vision-request-1234'});let failed=await settled('evidence-jobs/'+failStart.body.job.id,'job');assert.equal(failed.state,'failed');
 assert.equal((await call('evidence-jobs/'+failed.id+'/retry',{})).status,202);failed=await settled('evidence-jobs/'+failed.id,'job');assert.equal(failed.state,'succeeded');assert.equal(failed.attempts,2);delete process.env.EVIDENCE_TEST_FAIL;
 const before=(await call('session')).body,reset=await call('reset',{requestId:'reset-linked-request-123456'});assert.equal(reset.status,200);assert.deepEqual(reset.body.session.assets,before.assets);assert.equal(reset.body.session.evidenceJobs.length,before.evidenceJobs.length);assert.equal(reset.body.session.proposalGeneration.used,1);
 const session=(await call('session')).body,stored=JSON.parse(await readFile(join(dir,session.ownerId,'state.json')));assert.equal(stored.resetHistory[0].tasks[0].snapshot.featureSelections[0].feature,feature.feature);assert.equal(stored.evidenceCalls,5);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}});
