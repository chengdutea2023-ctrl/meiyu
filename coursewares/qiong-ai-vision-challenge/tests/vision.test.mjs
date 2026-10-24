import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { MODEL, recognitionPayload, parseRecognition, recognizeImage } from '../server/provider.mjs';
import { ORIGINAL, comparison, validRecord, recognitionTitle, reportText, grade } from '../src/engine.js';

const result = { status: 'identified', name: '执壶', evidence: ['可见器口和把手'], uncertainty: '不能确定年代和窑口' };
test('provider sends only current pixels and fixed instructions, never artifact answers or history', async () => {
  const payload = recognitionPayload('data:image/png;base64,AA==');
  assert.equal(payload.model, MODEL); assert.equal(payload.messages.length, 2); assert.equal(payload.messages[1].content[0].image_url.url, 'data:image/png;base64,AA==');
  assert.equal(payload.thinking.type, 'disabled'); assert.equal(payload.temperature, 0); assert.equal(payload.response_format.json_schema.strict,true);
  assert.doesNotMatch(JSON.stringify(payload), /邛窑|褐彩|qiong-ewer|groundTruth|71\.4/);
  let seen;
  const actual = await recognizeImage({ image: 'data:image/png;base64,AA==', apiKey: 'test-value', fetcher: async (_,init) => { seen = JSON.parse(init.body); return new Response(JSON.stringify({ id:'request-fixture',model:MODEL,choices:[{message:{content:JSON.stringify(result)}}],usage:{prompt_tokens:1280,completion_tokens:100}})); } });
  assert.deepEqual(seen, payload); assert.equal(actual.name, '执壶'); assert.equal(actual.providerRequestId, 'request-fixture');
  assert.equal(actual.usage.inputTokens,1280); assert.equal(actual.status,'identified');
});
test('insufficient information is explicit and malformed/provider failures cannot turn into invented results', async () => {
  assert.equal(parseRecognition({...result,status:'insufficient',name:'罐'}).name,'无法判断');
  assert.throws(()=>parseRecognition({...result,evidence:[]}), {code:'INVALID_RESULT'});
  await assert.rejects(recognizeImage({image:'x',apiKey:'test-value',fetcher:async()=>new Response('{}',{status:429})}),{code:'PROVIDER_BUSY'});
  await assert.rejects(recognizeImage({image:'x',apiKey:'test-value',fetcher:async()=>{throw Error('credential should never appear');}}), e=>e.code==='RESULT_UNKNOWN'&&!e.message.includes('credential'));
});
test('cloud results export as evidence, preserve legacy drafts and do not form mixed-model comparisons', () => {
  const legacy={specimenId:'a',params:{...ORIGINAL},values:[.1,.2,.7]};
  const original={...legacy,recognition:{...result,model:MODEL},name:'器物',phase:'原图'};delete original.values;
  const changed={...original,params:{...ORIGINAL,mask:true},phase:'变化后',recognition:{...original.recognition,status:'insufficient',name:'无法判断'}};
  assert.ok(validRecord(original));assert.ok(validRecord(legacy));assert.equal(comparison([legacy,changed]),null);assert.deepEqual(comparison([original,changed]),[original,changed]);
  assert.equal(recognitionTitle(changed),'无法判断');
  const work={records:[original,changed],observation:'遮住器物以后没有足够的形状线索，模型无法判断。',answers:{confidence:'relative',boundary:'outside'}};
  assert.equal(grade(work).score,100);assert.match(reportText(work),/可见依据/);assert.doesNotMatch(reportText(work),/undefined|NaN|71\.4/);
});
test('server verifies launch, rejects metadata, deduplicates calls and enforces five successful results across reloads', async () => {
  const data = await mkdtemp(join(tmpdir(),'qiong-vision-test-'));
  Object.assign(process.env,{PORT:'0',ALLOW_LOCAL_DEMO:'1',ARK_API_KEY:'test-value',COURSEWARE_DATA_DIR:data,PLATFORM_API_BASE:'https://platform.invalid/api/v1'});
  const realFetch=globalThis.fetch;let calls=0,failNext=false,lastBody;
  globalThis.fetch=async (url,options)=>{
    if(String(url).startsWith('https://platform.invalid'))return new Response('{}',{status:401});
    if(String(url).startsWith('https://ark.cn-beijing.volces.com')){calls++;lastBody=JSON.parse(options.body);await new Promise(r=>setTimeout(r,15));if(failNext){failNext=false;return new Response('{}',{status:503});}return new Response(JSON.stringify({model:MODEL,id:'fixture-'+calls,choices:[{message:{content:JSON.stringify(result)}}]}));}
    return realFetch(url,options);
  };
  let {server}=await import('../server/server.js'); if(!server.listening)await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port;
  const image='data:image/png;base64,'+(await sharp({create:{width:768,height:512,channels:3,background:'#bb514e'}}).png().toBuffer()).toString('base64');
  const experimentId='experiment-fixture-00001',headers={'content-type':'application/json','x-demo-id':'demo-browser-fixture-001'};
  const post=(body,override=headers)=>realFetch(base+'/api/recognize',{method:'POST',headers:override,body:JSON.stringify(body)});
  try {
    let r=await post({image,experimentId,requestId:'request-fixture-00001'},{'content-type':'application/json'});assert.equal(r.status,401);assert.equal(calls,0);
    r=await post({image,experimentId,requestId:'request-fixture-00001',groundTruth:'壶'});assert.equal(r.status,400);assert.equal(calls,0);
    r=await post({image:'data:image/png;base64,AA==',experimentId,requestId:'request-fixture-00001'});assert.equal(r.status,400);assert.equal(calls,0);
    const body={image,experimentId,requestId:'request-fixture-00001'};
    const responses=await Promise.all([post(body),post(body)]);assert.ok(responses.every(r=>r.status===200));assert.equal(calls,1);assert.deepEqual(await responses[0].json(),await responses[1].json());
    r=await post(body);assert.equal(r.status,200);assert.equal(calls,1);
    assert.doesNotMatch(JSON.stringify(lastBody),/groundTruth|specimenId|fixture|器物名称：/);
    failNext=true;r=await post({...body,requestId:'request-fixture-failed'});assert.equal(r.status,502);assert.equal(calls,2);
    r=await post({...body,requestId:'request-fixture-failed'});assert.equal(r.status,502);assert.equal(calls,2);
    for(let i=2;i<=5;i++){r=await post({...body,requestId:'request-fixture-0000'+i});assert.equal(r.status,200);}
    assert.equal(calls,6);r=await post({...body,requestId:'request-fixture-00006'});assert.equal(r.status,429);assert.equal(calls,6);
    r=await post({...body,requestId:'request-fixture-00007'},{'content-type':'application/json',authorization:'Bearer expired-fixture'});assert.equal(r.status,401);assert.equal(calls,6);
    const health=await (await realFetch(base+'/api/health')).json();assert.equal(health.model,MODEL);assert.equal(health.requestsUsed,6);assert.ok(!JSON.stringify(health).includes('test-value'));
    await new Promise(r=>server.close(r));({server}=await import('../server/server.js?restart-test=1'));if(!server.listening)await new Promise(r=>server.once('listening',r));
    r=await realFetch('http://127.0.0.1:'+server.address().port+'/api/recognize',{method:'POST',headers,body:JSON.stringify({...body,requestId:'request-after-restart'})});assert.equal(r.status,429);assert.equal(calls,6);
  } finally {globalThis.fetch=realFetch;await new Promise(r=>server.close(r));await rm(data,{recursive:true,force:true});}
});
