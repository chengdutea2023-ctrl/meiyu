import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {RESTORATION_CASES} from '../shared/restoration-cases.mjs';
import {digest} from '../server/domain.mjs';
const dir=await mkdtemp(join(tmpdir(),'qiong-three-cases-'));
Object.assign(process.env,{ALLOW_LOCAL_DEMO:'1',AI_TEST_MOCK:'1',AI_MAX_REQUESTS:'3',COURSEWARE_DATA_DIR:dir,PORT:'0',MOCK_DELAY_MS:'10'});
for(const key of ['ARK_API_KEY','COURSEWARE_ENV_FILE','AI_TEST_FAIL_KEY','AI_TEST_UNKNOWN_KEY'])delete process.env[key];
const {server}=await import('../server/server.js');if(!server.listening)await once(server,'listening');
const root=`http://127.0.0.1:${server.address().port}`;
const call=async(path,value)=>{const r=await fetch(root+'/api/'+path,{method:value===undefined?'GET':'POST',headers:{'content-type':'application/json','x-demo-id':'three-targets-student-fixture','x-lesson-version':'0'},body:value===undefined?undefined:JSON.stringify(value)});return {status:r.status,body:await r.json()};};
async function settle(id){for(let i=0;i<100;i++){const {body}=await call('proposals/'+id);if(!['pending','running'].includes(body.proposal.aiState))return body.proposal;await new Promise(r=>setTimeout(r,20));}throw Error('mock generation did not settle');}
test('real proposal routes freeze the selected target, pass its input, reject mixed masks and share three chances across types',async()=>{try{
 const png=await sharp({create:{width:40,height:40,channels:3,background:'#429563'}}).png().toBuffer();
 const {body:upload}=await call('assets',{role:'clue',source:'学生实拍',feature:'观察到弧形轮廓',dataUrl:'data:image/png;base64,'+png.toString('base64')});
 const input={requestId:'legacy-compatible-case-request',clueIds:[upload.asset.id],proposalText:'按线索中的轮廓补齐缺口'};
 const legacy=await call('proposals',input);assert.equal(legacy.status,201);assert.equal(legacy.body.proposal.snapshot.caseId,RESTORATION_CASES[0].id);
 assert.equal((await call('proposals',{...input,caseId:RESTORATION_CASES[0].id,maskDataUrl:legacy.body.proposal.maskDataUrl})).status,200);
 assert.equal((await call('proposals',{...input,caseId:'song-bowl'})).status,409);
 assert.equal((await call('proposals',{...input,requestId:'invalid-target-request-123',caseId:'../../private'})).status,400);
 const jarMask=legacy.body.proposal.maskDataUrl;
 assert.equal((await call('proposals',{...input,requestId:'mismatched-mask-request-123',caseId:'song-bowl',maskDataUrl:jarMask})).status,400);
 for(let i=0;i<3;i++){
  const c=RESTORATION_CASES[i];const created=i===0?legacy:await call('proposals',{...input,requestId:'distinct-case-request-'+i,caseId:c.id});assert.equal(created.status,201);
  const p=created.body.proposal;assert.equal(p.snapshot.caseName,c.name);assert.ok(p.snapshot.prompt.includes(c.name));
  const target=await readFile(new URL('../static/assets/'+c.damagedFile,import.meta.url));assert.equal(p.snapshot.targetHash,digest(target));
  await Promise.all([call(`proposals/${p.id}/generate`,{}),call(`proposals/${p.id}/generate`,{})]);const done=await settle(p.id);
  assert.equal(done.aiState,'succeeded');assert.equal(done.results.length,1);assert.equal(done.mocked,true);assert.deepEqual(done.results[0].inputHashes,[digest(target),upload.asset.hash]);
  const result=await fetch(root+'/api/files/'+done.results[0].fileId,{headers:{'x-demo-id':'three-targets-student-fixture'}}).then(r=>r.arrayBuffer());
  assert.deepEqual(await sharp(Buffer.from(result)).metadata().then(m=>[m.width,m.height]),[p.snapshot.width,p.snapshot.height]);
  assert.equal((await call('health')).body.requestsUsed,i+1);
 }
 const extra=await call('proposals',{...input,requestId:'fourth-case-request-123',caseId:'song-bowl'});
 assert.equal((await call(`proposals/${extra.body.proposal.id}/generate`,{})).body.code,'AI_VERSION_LIMIT');
 assert.deepEqual((await call('session')).body.proposalGeneration,{limit:3,used:3,remaining:0});
 assert.equal((await fetch(root+'/assets/case-bowl-original.png')).status,404);
 assert.equal((await fetch(root+'/assets/case-ewer-original.png')).status,404);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}});
