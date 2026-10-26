import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {digest} from '../server/domain.mjs';
const dir=await mkdtemp(join(tmpdir(),'qiong-test-allowance-')),demoId='authorized-quota-student-123',ownerId=digest('demo:'+demoId).slice(0,40),ownerDir=join(dir,ownerId);
await mkdir(ownerDir);await writeFile(join(dir,'request-count.json'),JSON.stringify({count:9}));
const image=await sharp({create:{width:40,height:40,channels:3,background:'#246f58'}}).png().toBuffer(),clue={id:'private-quota-clue-123456',role:'clue',source:'本地测试资料',feature:'观察器物的口沿轮廓',origin:'student',hash:digest(image)};
await writeFile(join(ownerDir,clue.id+'.png'),image);await writeFile(join(ownerDir,'state.json'),JSON.stringify({id:ownerId,proposalGenerationCount:3,assets:[clue],tasks:[],holdoutFrozen:[],resetHistory:[]}));
Object.assign(process.env,{ALLOW_LOCAL_DEMO:'1',AI_TEST_MOCK:'1',AI_MAX_REQUESTS:'9',AI_TEST_ALLOWANCE:JSON.stringify({ownerId,proposalLimit:15,extraRequests:12}),COURSEWARE_DATA_DIR:dir,PORT:'0',MOCK_DELAY_MS:'5'});
for(const key of ['ARK_API_KEY','COURSEWARE_ENV_FILE','AI_TEST_FAIL_KEY','AI_TEST_UNKNOWN_KEY'])delete process.env[key];
const {server}=await import('../server/server.js');if(!server.listening)await once(server,'listening');const root=`http://127.0.0.1:${server.address().port}/api/`;
const call=async(path,value,{id=demoId,version=0}={})=>{const r=await fetch(root+path,{method:value===undefined?'GET':'POST',headers:{'content-type':'application/json','x-demo-id':id,'x-lesson-version':String(version)},body:value===undefined?undefined:JSON.stringify(value)});return{status:r.status,body:await r.json()};};
const settle=async(id,options)=>{for(let i=0;i<100;i++){const r=await call('proposals/'+id,undefined,options);if(!['pending','running'].includes(r.body.proposal.aiState))return r.body.proposal;await new Promise(r=>setTimeout(r,10));}throw Error('mock request did not settle');};
const input=i=>({requestId:'quota-proposal-request-'+i,clueIds:[clue.id],proposalText:'根据线索的轮廓补齐缺口'});
test('a scoped twelve-request grant preserves the old three uses, survives reset, ignores client spoofing and never expands another student',async()=>{try{
 assert.deepEqual((await call('session')).body.proposalGeneration,{used:3,limit:15,remaining:12});assert.equal((await call('health')).body.requestLimit,21);
 const other={id:'unlisted-quota-student-123'};assert.deepEqual((await call('session',undefined,other)).body.proposalGeneration,{used:0,limit:3,remaining:3});
 const upload=await call('assets',{role:'clue',source:'本地测试',feature:'我发现弧形轮廓',dataUrl:'data:image/png;base64,'+image.toString('base64')},other);
 const spoof=await call('proposals',{...input('spoof'),clueIds:[upload.body.asset.id],proposalLimit:999,AI_TEST_ALLOWANCE:{ownerId}},other);assert.equal(spoof.status,201);assert.equal(spoof.body.proposalGeneration.limit,3);
 await call('proposals/'+spoof.body.proposal.id+'/generate',{},other);assert.equal((await settle(spoof.body.proposal.id,other)).results[0].code,'TEST_ALLOWANCE_SCOPE');assert.equal((await call('health')).body.requestsUsed,9);
 let version=0;
 for(let i=0;i<12;i++){
  const p=(await call('proposals',input(i),{version})).body.proposal;
  await Promise.all([call(`proposals/${p.id}/generate`,{},{version}),call(`proposals/${p.id}/generate`,{},{version})]);assert.equal((await settle(p.id,{version})).aiState,'succeeded');assert.equal((await call('health')).body.requestsUsed,10+i);
  if(i===0){const before=(await call('session')).body;const reset=await call('reset',{requestId:'quota-reset-request-123456'},{version});assert.equal(reset.status,200);version=1;assert.deepEqual(reset.body.session.proposalGeneration,{used:4,limit:15,remaining:11});assert.deepEqual(reset.body.session.assets,before.assets);}
 }
 const exhausted=(await call('session')).body;assert.deepEqual(exhausted.proposalGeneration,{used:15,limit:15,remaining:0});
 const p=(await call('proposals',input('thirteen'),{version})).body.proposal;assert.equal((await call(`proposals/${p.id}/generate`,{},{version})).body.code,'AI_VERSION_LIMIT');
 assert.equal(JSON.parse(await readFile(join(dir,'request-count.json'))).count,21);assert.equal(JSON.parse(await readFile(join(ownerDir,'state.json'))).proposalGenerationCount,15);
 assert.equal((await call('session',undefined,other)).body.proposalGeneration.limit,3);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}});
