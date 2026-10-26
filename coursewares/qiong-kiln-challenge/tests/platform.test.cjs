const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync(require.resolve('../static/platform-client.js'), 'utf8');
function client(query, handler) {
  const calls = [], notices = [], navigation = [];
  const context = {
    URLSearchParams, URL, AbortController, setTimeout, clearTimeout, structuredClone,
    location: { search:query, href:'https://lesson.example.test/course/ware/', assign: x => navigation.push(x) },
    history: { length:1, back: () => navigation.push('back') },
    document: { title:'课件测试', documentElement:{dataset:{}}, body:{prepend:()=>{}}, createElement:()=>({}), getElementById:()=>({set textContent(v){notices.push(v)}}) },
    fetch: async (url, options) => { const call = {url, body:JSON.parse(options.body)}; calls.push(call); return handler ? handler(call) : response({context:{}}); },
    window: { addEventListener:()=>{}, confirm:()=>false }
  };
  vm.runInNewContext(code, context);
  return { p:context.window.ZhikeCourseware, calls, notices, navigation };
}
const response = (body, ok = true) => ({ ok, status:ok?200:500, json:async()=>body });
const query = '?launchToken=test-only&platformApiBase=https%3A%2F%2Fplatform.example.test%2Fapi%2Fv1&returnUrl=https%3A%2F%2Fportal.example.test%2F';
const result = () => ({score:100,lessonFlow:'manual-ai',brief:'测试报告',resultItems:[{label:'模式',value:'我来烧、教AI烧'}],pendingArtifacts:[
  {localId:'a',fileName:'report.txt',mimeType:'text/plain',kind:'report',contentBase64:'b2s='},
  {localId:'b',fileName:'data.json',mimeType:'application/json',kind:'data',contentBase64:'e30='}
]});
test('missing launch is rejected; demo never calls a platform endpoint', async()=>{
  const missing = client(''); await assert.rejects(missing.p.initialize()); assert.equal(missing.calls.length,0);
  const demo = client('?demo=1'); await demo.p.initialize(); await demo.p.progress('x'); await demo.p.complete(result()); assert.equal(demo.calls.length,0);
});
test('expired launch prevents STARTED and all interaction initialization', async()=>{
  const c = client(query,()=>response({message:'expired'},false));
  await assert.rejects(c.p.initialize()); assert.equal(c.p.state.initialized,false);
  assert.equal(c.calls.length,1); assert.match(c.calls[0].url,/verify$/);
});
test('artifact failure blocks completion; retry reuses successful upload and frozen result', async()=>{
  let fail = true;
  const c = client(query, call => {
    if (call.url.endsWith('/artifacts')) {
      if (call.body.fileName==='data.json' && fail) {fail=false;return response({},false);}
      return response({url:'https://artifact.example.test/'+call.body.fileName,kind:call.body.kind,mimeType:call.body.mimeType});
    }
    return response({context:{}});
  });
  await c.p.initialize();
  assert.match(c.calls[0].url,/verify$/); assert.equal(c.calls[1].body.status,'STARTED');
  const first = c.p.complete(result()); assert.equal(c.p.complete(result()),first);
  await assert.rejects(first);
  assert.equal(c.calls.filter(x=>x.body.status==='COMPLETED').length,0);
  assert.equal(c.p.state.savedArtifactCount,1);
  const different = result(); different.score=5; await c.p.complete(different);
  assert.equal(c.calls.filter(x=>x.body.fileName==='report.txt').length,1);
  const final = c.calls.find(x=>x.body.status==='COMPLETED').body;
  assert.equal(final.score,100); assert.equal(final.summary.artifacts.length,2);
  assert.equal(final.summary.lessonFlow,'manual-ai');
  assert.ok(Number.isInteger(final.durationSeconds)); assert.ok(final.durationSeconds>=0);
  assert.equal(c.p.state.saveState,'saved');
  await c.p.complete(result()); assert.equal(c.calls.filter(x=>x.body.status==='COMPLETED').length,1);
});
test('completion failure is retryable and does not upload attachments twice', async()=>{
  let fail=true;
  const c=client(query,call=>{
    if(call.body.status==='COMPLETED'&&fail){fail=false;return response({},false);}
    return response({context:{},url:'https://artifact.example.test/file',kind:'report'});
  });
  await c.p.initialize(); await assert.rejects(c.p.complete(result()));
  assert.equal(c.p.state.saveState,'failed'); await c.p.complete(result());
  assert.equal(c.calls.filter(x=>x.url.endsWith('/artifacts')).length,2);
  assert.equal(c.p.state.saveState,'saved');
});
test('demonstration summary survives save retry as a frozen distinct-combination snapshot',async()=>{
 let fail=true;const c=client(query,call=>{if(call.body.status==='COMPLETED'&&fail){fail=false;return response({},false);}return response({context:{},url:'https://artifact.example.test/file',kind:'report'});});
 await c.p.initialize();const work={...result(),lessonFlow:'manual-demonstrations-ai',demonstrationVersion:'demonstrations-v1',trainingExperimentCount:3,
  demonstrationComparisons:[{combinationId:'steady+rush+low',selectedTypes:['steady','rush','low'],after:{rate:91}},{combinationId:'rush+early+alternate',selectedTypes:['rush','early','alternate'],after:{rate:29}}]};
 await assert.rejects(c.p.complete(work));work.demonstrationComparisons[0].after.rate=100;await c.p.complete(work);
 const sent=c.calls.filter(x=>x.body.status==='COMPLETED').at(-1).body.summary;
 assert.equal(sent.lessonFlow,'manual-demonstrations-ai');assert.equal(sent.demonstrationVersion,'demonstrations-v1');assert.equal(sent.trainingExperimentCount,3);assert.equal(sent.demonstrationComparisons.length,2);assert.equal(sent.demonstrationComparisons[0].after.rate,91);
 assert.equal(c.calls.filter(x=>x.url.endsWith('/artifacts')).length,2);
});
test('normal return is blocked during save and nonfinite score never completes',async()=>{
  let release;
  const c=client(query,call=>call.url.endsWith('/artifacts')?new Promise(r=>{release=()=>r(response({url:'https://artifact.example.test/x'}));}):response({context:{}}));
  await c.p.initialize();const data=result();data.pendingArtifacts=data.pendingArtifacts.slice(0,1);
  const saving=c.p.complete(data);assert.equal(c.p.returnToPortal(),false);assert.equal(c.navigation.length,0);
  await new Promise(resolve=>setImmediate(resolve));release();await saving;
  assert.equal(c.p.returnToPortal(),true);assert.equal(c.navigation[0],'https://portal.example.test/');
  const bad=client(query);await bad.p.initialize();const invalid=result();invalid.score=NaN;await assert.rejects(bad.p.complete(invalid));
  assert.equal(bad.calls.filter(x=>x.body.status==='COMPLETED').length,0);
});
