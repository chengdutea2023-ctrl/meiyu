import test from 'node:test';import assert from 'node:assert/strict';
import {createPlatform} from '../src/platform.js';import {ORIGINAL} from '../src/engine.js';
globalThis.location={href:'https://class.example/lesson/'};
const query='?launchToken=opaque-test&platformApiBase=https%3A%2F%2Fplatform.example%2Fapi%2Fv1';
const work={records:[{}, {mask:true}].map((p,i)=>({specimenId:'x',name:'壶',phase:i?'变化后':'原图',params:{...ORIGINAL,...p},prediction:'壶',values:[.1,.2,.7],image:'data:image/jpeg;base64,QQ=='})),observation:'遮挡了把手后壶的分数降低，模型可能依赖把手线索。',answers:{confidence:'relative',boundary:'outside'}};
const response=(data={},ok=true,status=200)=>({ok,status,json:async()=>data});
test('missing launch blocks and demo makes zero requests',async()=>{
 const p=createPlatform('',async()=>{throw Error('must not request')});await assert.rejects(p.initialize(),/学生后台/);
 const demo=createPlatform('?demo=1',async()=>{throw Error('must not request')});await demo.initialize();assert.equal((await demo.complete(work,'data:image/png;base64,QQ==')).saved,false);
});
test('preview labels distinguish online experience from a local preview',async()=>{
 const previous=globalThis.location;try{globalThis.location={href:'https://class.example/lesson/'};assert.equal((await createPlatform('?demo=1').initialize()).message,'体验模式，成绩不会保存');globalThis.location={href:'http://127.0.0.1:4189/'};assert.equal((await createPlatform('?demo=1').initialize()).message,'本地预览，成绩不会保存');}finally{globalThis.location=previous;}
});
test('verify rejects expired launches before STARTED',async()=>{
 let count=0;const p=createPlatform(query,async()=>{count++;return response({},false,403);});await assert.rejects(p.initialize(),/失效/);assert.equal(count,1);
});
test('partial upload failure retains uploads; double click shares completion',async()=>{
 const calls=[];let fail=true;
 const p=createPlatform(query,async(url,init)=>{const body=JSON.parse(init.body);calls.push({url,body});if(url.endsWith('/verify'))return response({context:{launchSessionId:'test-session'}});if(body.fileName?.endsWith('.txt')&&fail){fail=false;return response({},false,503);}return response({url:'/artifact/'+body.fileName,mimeType:body.mimeType});});
 await p.initialize();await assert.rejects(p.complete(work,'data:image/png;base64,QQ=='),/未成功/);
 assert.equal(calls.filter(c=>c.body.status==='COMPLETED').length,0);
 const a=p.complete(work,'data:image/png;base64,QQ=='),b=p.complete(work,'data:image/png;base64,QQ==');assert.equal(a,b);assert.equal((await a).saved,true);
 assert.equal(calls.filter(c=>c.body.fileName?.endsWith('.png')).length,1);assert.equal(calls.filter(c=>c.body.status==='COMPLETED').length,1);
});
test('COMPLETED failure retries no successful uploads',async()=>{
 let uploads=0,completions=0;const p=createPlatform(query,async(url,init)=>{const body=JSON.parse(init.body);if(url.endsWith('/verify'))return response({context:{launchSessionId:'s'}});if(body.fileName){uploads++;return response({url:'/artifact/'+body.fileName,mimeType:body.mimeType});}if(body.status==='COMPLETED'&&++completions===1)return response({},false,503);return response();});await p.initialize();await assert.rejects(p.complete(work,'data:image/png;base64,QQ=='));await p.complete(work,'data:image/png;base64,QQ==');assert.equal(uploads,3);assert.equal(completions,2);
});
test('a no-prediction experiment uploads honest reports and receives full process credit',async()=>{
 const calls=[];
 const optionalWork={...work,records:work.records.map(({prediction,...record})=>record)};
 const p=createPlatform(query,async(url,init)=>{
  const body=JSON.parse(init.body);calls.push({url,body});
  if(url.endsWith('/verify'))return response({context:{launchSessionId:'optional-prediction'}});
  return response(body.fileName?{url:'/artifact/'+body.fileName,mimeType:body.mimeType}:{});
 });
 await p.initialize();assert.equal((await p.complete(optionalWork,'data:image/png;base64,QQ==')).score,100);
 const completion=calls.find(c=>c.body.status==='COMPLETED').body;
 assert.equal(completion.score,100);
 assert.match(completion.summary.brief,/已记录 2 次识别，完成原图与单变量变化对照/);
 assert.equal(completion.summary.resultItems.filter(i=>['原图','变化后'].includes(i.label)).length,2);
 assert.match(completion.summary.resultItems.find(i=>i.label==='评分依据').value,/两次对照60/);
 const decode=b=>new TextDecoder().decode(Uint8Array.from(atob(b),c=>c.charCodeAt(0)));
 const text=decode(calls.find(c=>c.body.fileName?.endsWith('.txt')).body.contentBase64);
 assert.match(text,/我的预测（选填）：未填写/);assert.doesNotMatch(text,/undefined|预测20/);
 const data=JSON.parse(decode(calls.find(c=>c.body.fileName?.endsWith('.json')).body.contentBase64));
 assert.equal(data.grade.score,100);
 assert.equal(data.projectionVersion,'qiong-vision-images-v1');
 assert.deepEqual(data.records.map(r=>r.image),optionalWork.records.map(r=>r.image),'Projection preserves every actual recognized image');
 assert.ok(data.records.every(r=>!r.prediction),'Never invent student predictions');
});

test('two recognitions suffice for submission; unchanged or unrelated images do not',async()=>{
 const demo=createPlatform('?demo=1',async()=>{throw Error('must not request')});await demo.initialize();
 assert.equal((await demo.complete(work,'data:image/png;base64,QQ==')).score,100);
 for(const records of [[work.records[0]],[work.records[0],work.records[0]],[work.records[0],{...work.records[1],specimenId:'other'}]]){
  const p=createPlatform('?demo=1');await p.initialize();await assert.rejects(p.complete({...work,records},'data:image/png;base64,QQ=='),/对照实验/);
 }
});
test('new summaries and readable reports use computer vision while raw experiment model IDs stay intact',async()=>{
 const model='doubao-seed-2-1-pro-260915',calls=[];
 const cloudWork={...work,modelVersion:model,records:work.records.map(r=>({...r,recognition:{model,name:'壶',status:'identified',evidence:['可见把手'],uncertainty:'不能确定年代'}}))};
 const p=createPlatform(query,async(url,init)=>{const body=JSON.parse(init.body);calls.push(body);return response(url.endsWith('/verify')?{context:{launchSessionId:'neutral-labels'}}:body.fileName?{url:'/artifact/'+body.fileName,mimeType:body.mimeType}:{});});
 await p.initialize();await p.complete(cloudWork,'data:image/png;base64,QQ==');
 const complete=calls.find(b=>b.status==='COMPLETED');assert.deepEqual(complete.summary.resultItems.find(i=>i.label==='识别方式'),{label:'识别方式',value:'计算机视觉'});
 assert.doesNotMatch(JSON.stringify(complete.summary),/doubao|火山|豆包/i);
 const decode=b=>Buffer.from(b.contentBase64,'base64').toString();
 assert.doesNotMatch(decode(calls.find(b=>b.fileName?.endsWith('.txt'))),/doubao|火山|豆包/i);
 const data=JSON.parse(decode(calls.find(b=>b.fileName?.endsWith('.json'))));assert.equal(data.modelVersion,model);assert.ok(data.records.every(r=>r.recognition.model===model));
});
