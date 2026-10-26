import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { zipSync, strToU8 } from 'fflate';
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../apps/admin-web/src/restoration-projection.ts',import.meta.url),'utf8');
function load(fetcher=fetch){
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require,URL,TextDecoder,Uint8Array,AbortController,btoa:s=>Buffer.from(s,'binary').toString('base64'),fetch:fetcher,window:{location:{href:'https://teacher.example.test/'},setTimeout,clearTimeout}});
 return module.exports;
}
const P=load(), id='proposal-fixture-1234', png=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
const artifact={id:'package',kind:'evidence-package',mimeType:'application/octet-stream',fileName:'package.zip',originalFileName:'我的线索与复原方案.zip',url:'https://data.example.test/package',metadata:{workflowVersion:2,proposalId:id},sizeBytes:5000,createdAt:''};
const evidence=[{id:'clue-fixture-123',label:'线索1',feature:'口沿向外翻',source:'馆藏图录第12页'}];
const proposal=(ai=true)=>({id,workflowVersion:2,mocked:false,snapshot:{proposalText:'参考线索1补成外翻圆口',evidence},results:ai?[{state:'succeeded',fileId:'result-image-123'}]:[]});
const pack=(ai=true)=>zipSync({'复原方案.json':strToU8(JSON.stringify(proposal(ai))),'images/clue-fixture-123.png':png,...ai?{'results/AI复原候选.png':png}:{}});
const fixture=()=>({id:'record',course:{slug:'qiong-ai-inquiry',title:'邛窑AI探究'},courseware:{slug:'courseware-is9nlxd12',title:'邛窑AI修复挑战'},student:{displayName:'投屏验收学生'},summary:{workflowVersion:2,proposalId:id,brief:'参考线索1补成外翻圆口',artifacts:[{kind:artifact.kind,url:artifact.url}]},artifacts:[structuredClone(artifact)]});
const render=r=>P.buildRestorationProjectionHtml(r,'https://teacher.example.test/');
function legacy(ai=true){const r=fixture();r.artifacts[0].metadata.restorationProjection=P.readRestorationPackage(pack(ai),id);return r;}
test('restoration projection scopes the lesson and only reads the canonical submitted ZIP',()=>{
 const r=fixture();assert.equal(P.isRestorationProjectionRecord(r),true);assert.equal(P.isRestorationPackageArtifact(artifact,r),true);
 assert.equal(P.isRestorationProjectionRecord({...r,course:{slug:'other'},courseware:{slug:'other',title:'其他课件'}}),false);
 assert.equal(P.isRestorationPackageArtifact({...artifact,originalFileName:'other.zip'},r),false);
 assert.equal(P.isRestorationPackageArtifact({...artifact,metadata:{proposalId:'another'}},r),false);
 assert.equal(P.isRestorationPackageArtifact(artifact,{...r,summary:{...r.summary,artifacts:[]}}),false);
});
test('legacy package shows its saved repair, clue photographs, discoveries and sources without giant PNG previews',()=>{
 const r=legacy(),before=JSON.stringify(r),m=P.restorationProjectionModel(r,'https://teacher.example.test'),html=render(r);
 assert.ok(m.resultImage.startsWith('data:image/png;base64,'));
 assert.equal(m.clues.length,1);assert.equal(m.clues[0].feature,'口沿向外翻');assert.equal(m.clues[0].source,'馆藏图录第12页');
 assert.match(html,/AI修复后的文物/);assert.match(html,/我的线索与介绍/);assert.match(html,/馆藏图录第12页/);assert.match(html,/口沿向外翻/);
 assert.equal((html.match(/<img /g)||[]).length,2);assert.doesNotMatch(html,/作品与附件|<canvas|<iframe|score-card/);assert.equal(JSON.stringify(r),before);
});
test('text-only historical submission retains clues but never borrows another proposal result or calls the plan picture repaired',()=>{
 const r=legacy(false);r.artifacts.push({...artifact,id:'unsubmitted',kind:'restoration-result',url:'https://data.example.test/unfinished',metadata:{proposalId:'other'}});
 const m=P.restorationProjectionModel(r,'https://teacher.example.test');assert.equal(m.resultImage,'');assert.equal(m.clues.length,1);
 assert.match(render(r),/这份提交没有AI修复图/);assert.doesNotMatch(render(r),/src="https:\/\/data.example.test\/unfinished/);
 assert.equal((render(r).match(/<img /g)||[]).length,1);
});
function fresh(){
 const r=fixture(),result={...artifact,id:'result',kind:'restoration-result',mimeType:'image/png',url:'https://data.example.test/result.png'},clue={...artifact,id:'clue',kind:'restoration-clue',mimeType:'image/png',url:'https://data.example.test/clue.png'};
 r.artifacts.push(result,clue);r.summary.artifacts.push({kind:result.kind,url:result.url},{kind:clue.kind,url:clue.url});
 r.summary.restorationProjection={version:'qiong-restoration-projection-v1',proposalId:id,proposalText:'依据线索1修复',resultUrl:result.url,clues:[{label:'线索1',imageUrl:clue.url,feature:'我发现口沿向外翻',source:'博物馆实拍'}]};return r;
}
test('new projection displays independently saved images, and rejects unreferenced uploads and mismatched IDs',()=>{
 const r=fresh(),m=P.restorationProjectionModel(r,'https://teacher.example.test');assert.equal(m.resultImage,'https://data.example.test/result.png');assert.equal(m.clues[0].image,'https://data.example.test/clue.png');
 r.summary.artifacts=r.summary.artifacts.filter(a=>a.kind!=='restoration-result');assert.equal(P.restorationProjectionModel(r,'https://teacher.example.test').resultImage,'');
 const wrong=fresh();wrong.summary.restorationProjection.proposalId='other';assert.equal(P.restorationProjectionModel(wrong,'https://teacher.example.test').resultImage,'');
});
test('malformed and oversized ZIP entries or another proposal cannot be displayed',()=>{
 assert.throws(()=>P.readRestorationPackage(new Uint8Array([1,2,3]),id));
 assert.throws(()=>P.readRestorationPackage(pack(),'another'),/不匹配/);
 assert.throws(()=>P.readRestorationPackage(zipSync({'复原方案.json':strToU8('{bad')}),id));
 assert.throws(()=>P.readRestorationPackage(zipSync({'../bad.png':png}),id),/限制/);
 assert.throws(()=>P.readRestorationPackage(zipSync({'images/oversized-clue-123.png':new Uint8Array(13*1024*1024)}),id),/限制/);
 const bad=proposal();bad.snapshot.evidence=[...evidence,...evidence,...evidence,...evidence];assert.throws(()=>P.readRestorationPackage(zipSync({'复原方案.json':strToU8(JSON.stringify(bad))}),id),/不匹配/);
});
test('loader fetches through current portal with no credentials and bounded responses',async()=>{
 let requested,options;
 const a={...artifact,url:'https://data.example.test/api/v1/course-runtime/artifacts/abcdefghijklmnop/file'},r=fixture();r.artifacts=[a];r.summary.artifacts=[{kind:a.kind,url:a.url}];
 const M=load(async(url,init)=>{requested=url;options=init;return new Response(pack());});const data=await M.loadRestorationPackage(a,r);
 assert.equal(requested,'https://teacher.example.test/api/v1/course-runtime/artifacts/abcdefghijklmnop/file');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(data.proposalId,id);
 for(const response of [new Response('',{status:503}),new Response('',{headers:{'content-length':String(36*1024*1024)}}),new Response('not a zip')])await assert.rejects(()=>load(async()=>response).loadRestorationPackage(artifact,fixture()));
 for(const url of ['javascript:alert(1)','https://user:pass@example.test/file']){
  const unsafe={...artifact,url},r=fixture();r.artifacts=[unsafe];r.summary.artifacts=[{url,kind:artifact.kind}];await assert.rejects(()=>M.loadRestorationPackage(unsafe,r));
 }
});
test('learner text is escaped, executable links are rejected, and read errors stay distinct from absent AI',()=>{
 const r=legacy();r.student.displayName='<script>alert(1)</script>';r.artifacts[0].metadata.restorationProjection.clues[0].feature='<img src=x onerror=alert(1)>';
 const html=render(r);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script|<img src=x/);
 const fail=fixture();fail.artifacts[0].metadata.restorationProjectionError=true;assert.match(render(fail),/资料暂时未读出/);assert.doesNotMatch(render(fail),/这份提交没有AI修复图/);
 const unsafe=fresh();unsafe.artifacts.find(a=>a.kind==='restoration-result').url='javascript:alert(1)';unsafe.summary.restorationProjection.resultUrl='javascript:alert(1)';unsafe.summary.artifacts.push({kind:'restoration-result',url:'javascript:alert(1)'});assert.equal(P.restorationProjectionModel(unsafe,'https://teacher.example.test').resultImage,'');
});
test('the actual default projection entry hydrates repair packages and preserves existing lesson renderers',async()=>{
 const app=await readFile(new URL('../apps/admin-web/src/App.tsx',import.meta.url),'utf8');
 assert.match(app,/loadRestorationPackage\(artifact,record\)/);assert.match(app,/isRestorationProjectionRecord\(record\).*buildRestorationProjectionHtml/s);
 assert.match(app,/buildVisionProjectionHtml/);assert.match(app,/buildKilnProjectionHtml/);assert.match(app,/buildRpsProjectionHtml/);
});


test('new targets keep their saved object names on projection; legacy work stays a four-ear jar',()=>{
 const r=fresh();r.summary.restorationProjection.caseName='宋·邛窑瓷碗';
 assert.equal(P.restorationProjectionModel(r,'https://teacher.example.test').caseName,'宋·邛窑瓷碗');
 assert.match(render(r),/宋·邛窑瓷碗 · 修复效果/);assert.doesNotMatch(render(r),/修复后的陶罐/);
 const old=legacy();assert.equal(P.restorationProjectionModel(old,'https://teacher.example.test').caseName,'四系罐');
});
