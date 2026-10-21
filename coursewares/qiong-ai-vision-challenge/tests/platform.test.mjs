import test from 'node:test';import assert from 'node:assert/strict';
import {createPlatform} from '../src/platform.js';import {ORIGINAL} from '../src/engine.js';
globalThis.location={href:'https://class.example/lesson/'};
const query='?launchToken=opaque-test&platformApiBase=https%3A%2F%2Fplatform.example%2Fapi%2Fv1';
const work={records:[{}, {mask:true}, {}].map((p,i)=>({specimenId:'x',name:'壶',phase:String(i),params:{...ORIGINAL,...p},prediction:'壶',values:[.1,.2,.7],image:'data:image/jpeg;base64,QQ=='})),observation:'遮挡了把手后分数改变，恢复后与最初接近。',answers:{confidence:'relative',boundary:'outside'}};
const response=(data={},ok=true,status=200)=>({ok,status,json:async()=>data});
test('missing launch blocks and demo makes zero requests',async()=>{
 const p=createPlatform('',async()=>{throw Error('must not request')});await assert.rejects(p.initialize(),/学生后台/);
 const demo=createPlatform('?demo=1',async()=>{throw Error('must not request')});await demo.initialize();assert.equal((await demo.complete(work,'data:image/png;base64,QQ==')).saved,false);
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
