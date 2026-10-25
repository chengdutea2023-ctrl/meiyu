import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { digest } from '../server/domain.mjs';
import { preparationDigest } from '../server/preparation.mjs';
import { preparationEvidence } from '../shared/preparation-evidence.mjs';

const dir=await mkdtemp(join(tmpdir(),'qiong-v2-proposals-'));
let classroomOpen=true;
const verifier=createServer(async(req,res)=>{let raw='';for await(const p of req)raw+=p;const b=JSON.parse(raw),token=b.preparationToken||b.launchToken;res.setHeader('content-type','application/json');if(token==='expired'||!b.preparationToken&&!classroomOpen){res.writeHead(401);return res.end('{}');}const teacher=token==='teacher',id=token==='teacher'?'student':token;res.end(JSON.stringify({context:{...(b.preparationToken?{role:teacher?'TEACHER':'STUDENT'}:{}),actor:{id:teacher?'teacher':id,name:teacher?'测试教师':'测试学生'},student:teacher?null:{id,userType:'STUDENT'},students:teacher?[{id:'student',name:'测试学生'}]:[],assignment:{id:'assignment',title:'三步版隔离任务'},courseware:{id:'ware',slug:'v2-fixture'},course:{slug:'fixture'}}}));});
verifier.listen(0,'127.0.0.1');await once(verifier,'listening');
Object.assign(process.env,{PLATFORM_API_BASE:`http://127.0.0.1:${verifier.address().port}`,COURSEWARE_DATA_DIR:dir,COURSE_SLUG:'fixture',COURSEWARE_SLUG:'v2-fixture',ALLOW_LOCAL_DEMO:'1',AI_TEST_MOCK:'1',AI_MAX_REQUESTS:'3',MOCK_DELAY_MS:'70',PORT:'0'});delete process.env.ARK_API_KEY;delete process.env.COURSEWARE_ENV_FILE;delete process.env.AI_TEST_FAIL_KEY;
const oldId=digest('legacy:assignment:ware').slice(0,40);await mkdir(join(dir,oldId));
const bytes=await readFile(new URL('../static/assets/case-damaged.png',import.meta.url));
const legacyAssets=[...Array.from({length:8},(_,i)=>({id:`legacy-teacher-photo-${i}`,builtinId:`builtin-${i}`,role:'excluded',source:'旧教师资料',feature:'旧观察',hash:`old-${i}`})),...['reference','reference','holdout','holdout'].map((role,i)=>({id:`old-student-photo-${i}`,role,source:'以前保存的学生来源',feature:'我发现口沿向外翻',hash:digest(bytes),origin:'student',title:`英文文件-${i}`}))];
for(const a of legacyAssets.filter(a=>!a.builtinId))await writeFile(join(dir,oldId,a.id+'.png'),bytes);
const oldState={id:oldId,assets:legacyAssets,holdoutFrozen:['old-student-photo-2','old-student-photo-3'],tasks:[],preparation:{status:'APPROVED',revision:15,evidenceDigest:preparationDigest(legacyAssets)}};await writeFile(join(dir,oldId,'state.json'),JSON.stringify(oldState));
const uncertainOwner=digest('uncertain:assignment:ware').slice(0,40);await mkdir(join(dir,uncertainOwner));await writeFile(join(dir,uncertainOwner,'state.json'),JSON.stringify({...oldState,id:uncertainOwner,holdoutFrozen:[]}));for(const a of legacyAssets.filter(a=>!a.builtinId))await writeFile(join(dir,uncertainOwner,a.id+'.png'),bytes);
const {server}=await import('../server/server.js');if(!server.listening)await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}/api/`;
async function call(path,{token='student',prep=false,method='GET',value,version=0}={}){const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?(prep?{'x-preparation-token':token}:{authorization:`Bearer ${token}`}):{}),'x-lesson-version':String(version)},body:value===undefined?undefined:JSON.stringify(value)});return{status:r.status,body:await r.json()};}
const post=(path,value,extra={})=>call(path,{method:'POST',value,...extra});
async function settled(id,token='student'){for(let n=0;n<150;n++){const r=await call(`proposals/${id}`,{token});if(!['pending','running'].includes(r.body.proposal?.aiState))return r.body.proposal;await new Promise(r=>setTimeout(r,20));}throw Error('proposal did not finish');}
const input=(ids,key='proposal-request-12345678')=>({requestId:key,clueIds:ids,proposalText:'我想把缺口补成外翻圆口，因为线索中的同类罐口也是向外翻的。'});

test('one approved clue is sufficient for a no-AI proposal; single-image AI is optional, owned, frozen, and idempotent',async()=>{try{
 assert.equal((await post('proposals',input(['fake']),{token:null})).status,401);
 assert.equal((await post('proposals',input(['fake']),{token:'expired'})).status,401);
 assert.equal((await post('proposals',input(['fake']),{prep:true})).status,403);
 assert.equal((await post('preparation/settings',{workflowVersion:2,enabled:true,instructions:'课外找线索，每张记下来源和一句发现。'},{token:'teacher',prep:true})).status,200);
 const png=await sharp({create:{width:40,height:40,channels:3,background:'#3987bf'}}).png().toBuffer();
 const upload=await post('assets',{role:'clue',title:'test-photo',source:'学生实拍，第1页',feature:'我发现圆口向外翻',dataUrl:'data:image/png;base64,'+png.toString('base64')},{prep:true});assert.equal(upload.status,200);const clue=upload.body.asset;
 assert.equal((await post('proposals',input([clue.id]))).status,403);
 assert.equal((await post('preparation/submit',{workflowVersion:2},{prep:true})).status,200);
 let detail=(await call('preparation/students/student',{token:'teacher',prep:true})).body;
 assert.equal((await post('preparation/students/student/review',{revision:detail.preparation.revision,evidenceDigest:detail.preparation.evidenceDigest,decision:'APPROVED',feedback:'线索完整'},{token:'teacher',prep:true})).status,200);
 classroomOpen=false;assert.equal((await post('proposals',input([clue.id]))).status,401);classroomOpen=true;
 const [a,b]=await Promise.all([post('proposals',input([clue.id])),post('proposals',input([clue.id]))]);assert.equal(a.status,201);assert.equal(a.body.proposal.id,b.body.proposal.id);let p=a.body.proposal;assert.equal(p.requestId,input([clue.id]).requestId);
 assert.equal(p.workflowVersion,2);assert.equal(p.aiState,'not_requested');assert.equal(p.results.length,0);assert.equal(p.snapshot.clueIds.length,1);assert.equal((await call('health')).body.requestsUsed,0);
 assert.equal((await call('session')).body.proposals.length,1);assert.equal((await call('session')).body.tasks.length,0);
 assert.equal((await call(`proposals/${p.id}`,{token:'other'})).status,404);
 const normalized={...input([clue.id]),maskDataUrl:p.maskDataUrl};assert.equal((await post('proposals',normalized)).status,200,'PNG normalization must not break idempotency');
 assert.equal((await post('proposals',{...normalized,proposalText:'修改了方案内容'})).status,409);
 const generated=await Promise.all([post(`proposals/${p.id}/generate`,{}),post(`proposals/${p.id}/generate`,{})]);assert.ok(generated.every(r=>[200,202].includes(r.status)));p=await settled(p.id);
 assert.equal(p.results.length,1);assert.equal(p.aiState,'succeeded');assert.equal(p.results[0].referenceCount,1);assert.deepEqual(p.results[0].inputHashes,[p.snapshot.targetHash,clue.hash]);assert.equal((await call('health')).body.requestsUsed,1);
 // No unsent holdout group is needed; old teacher material is never counted as student clues.
 const old=(await call('session',{token:'legacy'})).body;assert.equal(preparationEvidence(old.assets).counts.active,4);assert.equal(old.assets.length,12);assert.equal(preparationEvidence(old.assets).legacy.length,8);
 assert.equal((await post('proposals',input(['legacy-teacher-photo-0'],'legacy-spoof-request-123'),{token:'legacy'})).status,400);
 const oldPlan=await post('proposals',input(['old-student-photo-2'],'legacy-clue-request-12345'),{token:'legacy'});assert.equal(oldPlan.status,201);assert.equal(oldPlan.body.proposal.snapshot.evidence[0].role,'holdout');
 assert.equal((await post(`proposals/${oldPlan.body.proposal.id}/generate`,{},{token:'legacy'})).status,202);assert.equal((await settled(oldPlan.body.proposal.id,'legacy')).aiState,'succeeded');assert.equal((await call('health')).body.requestsUsed,2);
 assert.equal((await call('session',{token:'legacy'})).body.preparation.evidenceDigest,oldState.preparation.evidenceDigest);
 // Teacher feedback and upload edits still invalidate approval, even for an existing request ID.
 assert.equal((await post('preparation/reopen',{},{prep:true})).status,200);
 assert.equal((await post('proposals',normalized)).status,403);
 assert.equal((await post('preparation/submit',{workflowVersion:2},{prep:true})).status,200);detail=(await call('preparation/students/student',{token:'teacher',prep:true})).body;
 await post('preparation/students/student/review',{revision:detail.preparation.revision,evidenceDigest:detail.preparation.evidenceDigest,decision:'APPROVED'},{token:'teacher',prep:true});
 process.env.AI_TEST_FAIL_KEY='proposal';const next=await post('proposals',input([clue.id],'failed-ai-plan-request-1234'));assert.equal(next.status,201);await post(`proposals/${next.body.proposal.id}/generate`,{});let failed=await settled(next.body.proposal.id);assert.equal(failed.aiState,'failed');assert.equal((await call('health')).body.requestsUsed,2);
 delete process.env.AI_TEST_FAIL_KEY;await post(`proposals/${failed.id}/retry`,{});failed=await settled(failed.id);assert.equal(failed.aiState,'succeeded');assert.equal((await call('health')).body.requestsUsed,3);assert.equal((await post(`proposals/${failed.id}/retry`,{})).status,400);
 const before=(await call('session')).body;
 const reset=await post('reset',{requestId:'v2-reset-request-1234567'});assert.equal(reset.status,200);assert.equal(reset.body.session.proposals.length,0);assert.deepEqual(reset.body.session.assets,before.assets);assert.deepEqual(reset.body.session.preparation,before.preparation);
 const afterReset=await post('proposals',input([clue.id],'after-reset-proposal-1234'),{version:1});assert.equal(afterReset.status,201);const limited=await post(`proposals/${afterReset.body.proposal.id}/generate`,{},{version:1});assert.equal(limited.status,429);assert.equal(limited.body.code,'AI_VERSION_LIMIT');assert.equal((await call('health')).body.requestsUsed,3);
 const disk=JSON.parse(await readFile(join(dir,digest('student:assignment:ware').slice(0,40),'state.json')));assert.equal(disk.proposalGenerationCount,2);assert.equal(disk.resetHistory[0].tasks.filter(t=>t.workflowVersion===2).length,2);
 // Quota failure is a terminal optional-AI failure; the saved proposal remains usable.
 const quota=await post('proposals',input(['old-student-photo-0'],'quota-proposal-request-123'),{token:'legacy'});assert.equal(quota.status,201);await post(`proposals/${quota.body.proposal.id}/generate`,{},{token:'legacy'});const quotaResult=await settled(quota.body.proposal.id,'legacy');assert.equal(quotaResult.aiState,'failed');assert.equal(quotaResult.results[0].code,'TEST_BUDGET_REACHED');assert.equal((await call('health')).body.requestsUsed,3);
 // Uncertain requests cannot be retried; a no-AI plan remains a valid alternative.
 process.env.AI_TEST_UNKNOWN_KEY='proposal';const uncertain=await post('proposals',input(['old-student-photo-1'],'uncertain-plan-request-123'),{token:'uncertain'});assert.equal(uncertain.status,201);await post(`proposals/${uncertain.body.proposal.id}/generate`,{},{token:'uncertain'});const unknown=await settled(uncertain.body.proposal.id,'uncertain');assert.equal(unknown.aiState,'unknown');assert.equal((await post(`proposals/${unknown.id}/retry`,{},{token:'uncertain'})).status,400);assert.equal((await post(`proposals/${unknown.id}/generate`,{},{token:'uncertain'})).body.proposal.aiState,'unknown');assert.equal((await call('health')).body.requestsUsed,3);delete process.env.AI_TEST_UNKNOWN_KEY;assert.equal((await post('proposals',input(['old-student-photo-1'],'no-ai-after-unknown-123456'),{token:'uncertain'})).body.proposal.aiState,'not_requested');
 const history=(await call('history')).body.entries;assert.ok(history.some(t=>t.id===p.id));assert.equal((await call(`files/${p.results[0].fileId}?format=data`)).status,200);assert.equal((await call(`files/${p.results[0].fileId}?format=data`,{token:'other'})).status,404);
 assert.equal((await post('proposals',input([clue.id],'stale-tab-proposal-123456'))).status,409);
 }finally{await new Promise(r=>server.close(r));await new Promise(r=>verifier.close(r));await rm(dir,{recursive:true,force:true});}});
