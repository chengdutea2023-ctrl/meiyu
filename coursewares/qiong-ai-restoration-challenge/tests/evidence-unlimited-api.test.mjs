import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import sharp from 'sharp';
import {digest} from '../server/domain.mjs';

const dir=await mkdtemp(join(tmpdir(),'qiong-evidence-unlimited-'));
await writeFile(join(dir,'evidence-request-count.json'),JSON.stringify({count:11,reservedCny:2.75}));
const ownerId=digest('demo:unlimited-test-student-123456').slice(0,40);
await mkdir(join(dir,ownerId));
await writeFile(join(dir,ownerId,'state.json'),JSON.stringify({id:ownerId,assets:[],tasks:[],holdoutFrozen:[],evidenceCalls:10,evidenceJobs:Array.from({length:40},(_,i)=>({id:`old-job-${i}`,state:'succeeded',signature:`old-${i}`}))}));
Object.assign(process.env,{ALLOW_LOCAL_DEMO:'1',AI_TEST_MOCK:'0',AI_MAX_REQUESTS:'0',ARK_EVIDENCE_API_KEY:'intercepted-fixture',EVIDENCE_MAX_REQUESTS:'1',EVIDENCE_BUDGET_CNY:'0.25',EVIDENCE_MAX_REQUESTS_PER_TASK:'1',EVIDENCE_UNLIMITED:'1',COURSEWARE_DATA_DIR:dir,PORT:'0'});
delete process.env.COURSEWARE_ENV_FILE;delete process.env.EVIDENCE_TEST_OWNER_ID;delete process.env.ARK_API_KEY;
const originalFetch=globalThis.fetch;let calls=0;
globalThis.fetch=async(url,options)=>{
 if(String(url).startsWith('http://127.0.0.1:'))return originalFetch(url,options);
 assert.equal(String(url),'https://ark.cn-beijing.volces.com/api/v3/chat/completions');calls++;
 return new Response(JSON.stringify({id:'intercepted',usage:{prompt_tokens:100,completion_tokens:50},choices:[{message:{content:JSON.stringify({items:[{index:1,part:'口沿',feature:'外翻的口沿',region:[.2,.2,.8,.6],relevance:'direct',reason:'可参考口沿'}]})}}]}));
};
const {server}=await import('../server/server.js');if(!server.listening)await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}/api/`;
async function call(path,value){const r=await fetch(base+path,{method:value===undefined?'GET':'POST',headers:{'content-type':'application/json','x-demo-id':'unlimited-test-student-123456','x-lesson-version':'0'},body:value===undefined?undefined:JSON.stringify(value)});return{status:r.status,body:await r.json()};}
async function wait(id){for(let i=0;i<100;i++){const {job}=(await call('evidence-jobs/'+id)).body;if(!['pending','running'].includes(job.state))return job;await new Promise(r=>setTimeout(r,10));}throw Error('did not settle');}
test('explicit unlimited mode lifts global and per-task evidence limits but retains the real counter',async()=>{try{
 const png=await sharp({create:{width:100,height:100,channels:3,background:'#997733'}}).png().toBuffer();
 const asset=(await call('assets',{dataUrl:'data:image/png;base64,'+png.toString('base64'),role:'clue',source:'隔离额度测试',feature:'口沿可见'})).body.asset;
 for(const [i,caseId] of ['four-ear-jar','song-bowl','brown-ewer'].entries()){
  const result=await call('evidence-jobs',{kind:'analysis',requestId:`unlimited-analysis-request-${i}-12345`,caseId,clueIds:[asset.id]});assert.equal(result.status,202);assert.equal((await wait(result.body.job.id)).state,'succeeded');
 }
 const h=(await call('health')).body;assert.equal(calls,3);assert.equal(h.evidence.requestsUsed,14);assert.equal(h.evidence.requestLimit,null);assert.equal(h.evidence.budgetCny,null);assert.equal(h.evidence.unlimited,true);
}finally{globalThis.fetch=originalFetch;await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}});
