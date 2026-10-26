import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {once} from 'node:events';import sharp from 'sharp';
const dir=await mkdtemp(join(tmpdir(),'qiong-evidence-budget-'));
await writeFile(join(dir,'evidence-request-count.json'),JSON.stringify({count:11,reservedCny:2.75}));
Object.assign(process.env,{ALLOW_LOCAL_DEMO:'1',AI_TEST_MOCK:'0',AI_MAX_REQUESTS:'0',ARK_EVIDENCE_API_KEY:'fixture-only-never-sent',EVIDENCE_MAX_REQUESTS:'100',EVIDENCE_BUDGET_CNY:'3',COURSEWARE_DATA_DIR:dir,PORT:'0'});
delete process.env.COURSEWARE_ENV_FILE;delete process.env.EVIDENCE_TEST_OWNER_ID;delete process.env.ARK_API_KEY;delete process.env.ARK_EVIDENCE_MODEL;
const originalFetch=globalThis.fetch;let calls=0;
globalThis.fetch=async(url,options)=>{
 if(String(url).startsWith('http://127.0.0.1:'))return originalFetch(url,options);
 assert.equal(String(url),'https://ark.cn-beijing.volces.com/api/v3/chat/completions');calls++;
 return new Response(JSON.stringify({id:'intercepted-budget-fixture',usage:{prompt_tokens:100,completion_tokens:50},choices:[{message:{content:JSON.stringify({items:[{index:1,part:'口沿',feature:'外翻的口沿',region:[.2,.2,.8,.6],relevance:'direct',reason:'可参考口沿'}]})}}]}));
};
const {server}=await import('../server/server.js');if(!server.listening)await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}/api/`;
async function call(path,value){const r=await fetch(base+path,{method:value===undefined?'GET':'POST',headers:{'content-type':'application/json','x-demo-id':'budget-student-local-123456','x-lesson-version':'0'},body:value===undefined?undefined:JSON.stringify(value)});return{status:r.status,body:await r.json()};}
async function wait(id){for(let i=0;i<100;i++){const {job}= (await call('evidence-jobs/'+id)).body;if(!['pending','running'].includes(job.state))return job;await new Promise(r=>setTimeout(r,10));}throw Error('did not settle');}
test('real-mode reservation enforces the monetary cap before any outbound call and cannot borrow another task allowance',async()=>{try{
 const png=await sharp({create:{width:100,height:100,channels:3,background:'#997733'}}).png().toBuffer();const asset=(await call('assets',{dataUrl:'data:image/png;base64,'+png.toString('base64'),role:'clue',source:'隔离预算测试',feature:'口沿可见'})).body.asset;
 const input={kind:'analysis',requestId:'budget-analysis-request-12345',caseId:'four-ear-jar',clueIds:[asset.id]};
 const first=(await call('evidence-jobs',input)).body.job;assert.equal((await wait(first.id)).state,'succeeded');assert.equal(calls,1);
 let h=(await call('health')).body;assert.equal(h.evidence.requestsUsed,12);assert.equal(h.evidence.reservedCny,3);assert.equal(h.evidence.requestLimit,100);assert.equal(h.requestsUsed,0);
 const over=(await call('evidence-jobs',{...input,requestId:'over-budget-request-123456',caseId:'song-bowl'})).body.job;assert.equal((await wait(over.id)).code,'VISION_BUDGET_REACHED');assert.equal(calls,1);
 process.env.EVIDENCE_TEST_OWNER_ID='f'.repeat(40);const wrong=(await call('evidence-jobs',{...input,requestId:'wrong-scope-request-123456',caseId:'brown-ewer'})).body.job;assert.equal((await wait(wrong.id)).code,'VISION_TEST_SCOPE');assert.equal(calls,1);
 h=(await call('health')).body;assert.equal(h.evidence.requestsUsed,12);assert.equal(h.evidence.reservedCny,3);assert.equal(h.requestsUsed,0);
 }finally{globalThis.fetch=originalFetch;await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}});
