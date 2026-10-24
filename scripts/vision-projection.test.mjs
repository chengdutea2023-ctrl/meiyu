import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../apps/admin-web/src/vision-projection.ts',import.meta.url),'utf8');
const load=(fetcher=fetch)=>{const module={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,URL,TextDecoder,AbortController,fetch:fetcher,window:{location:{href:'https://teacher.example.test/'},setTimeout,clearTimeout}});return module.exports;};
const P=load(),png='data:image/png;base64,iVBORw0KGgo=';
const artifact={id:'fixture',kind:'experiment-data',mimeType:'application/json',originalFileName:'邛窑 -AI看见了什么-实验数据.json',fileName:'fixture.json',url:'https://data.example.test/report.json',metadata:{},sizeBytes:1000,createdAt:''};
const row=(i,image=png)=>({specimenId:'a',name:'执壶',params:{angle:0,blur:i?i:0,mask:false,x:.25,y:.25,w:.25,h:.3},image,recognition:{model:'doubao-seed-2-1-pro-260915',name:i===4?'无法判断':'执壶',status:i===4?'insufficient':'identified',evidence:['可见把手与短流'],uncertainty:'看不到背面'}});
const data=()=>({modelVersion:'doubao-seed-2-1-pro-260915',projectionVersion:'qiong-vision-images-v1',records:Array.from({length:5},(_,i)=>row(i)),observation:'遮挡以后，没有足够的可见线索，模型无法判断。'});
const fixture=()=>({course:{slug:'qiong-ai-inquiry',title:'邛窑AI探究'},courseware:{slug:'courseware',title:'邛窑 -AI看见了什么'},student:{displayName:'投屏测试学生',email:'fixture@example.invalid'},score:100,durationSeconds:172,summary:{scoreText:'100 分（实验过程）',processSummary:'我的观察',resultItems:[{label:'模型',value:'technical-model-code'},{label:'评分依据',value:'60/20/20'}]},artifacts:[{...artifact,metadata:{visionExperiment:data()}},{...artifact,mimeType:'image/png',kind:'final-work',originalFileName:'邛窑 -AI看见了什么-实验卡.png',url:'https://data.example.test/card.png'}]});
const render=r=>P.buildVisionProjectionHtml(r,'https://teacher.example.test/');
test('vision projection is limited to this courseware, including old and renamed titles',()=>{
 assert.equal(P.isVisionProjectionRecord(fixture()),true);assert.equal(P.isVisionProjectionRecord({...fixture(),courseware:{slug:'other',title:'邛窑AI眼力挑战'}}),true);
 assert.equal(P.isVisionProjectionRecord({...fixture(),course:{slug:'other'},courseware:{slug:'courseware',title:'其他课件'}}),false);
 assert.equal(P.isVisionExperimentArtifact(artifact),true);assert.equal(P.isVisionExperimentArtifact({...artifact,originalFileName:'邛窑眼力实验数据.json'}),true);
 assert.equal(P.isVisionExperimentArtifact({...artifact,originalFileName:'other.json'}),false);
});
test('new projection displays each saved input with judgment and observation, without generic score or attachment panels',()=>{
 const r=fixture(),m=P.visionProjectionModel(r,'https://teacher.example.test'),html=render(r);
 assert.equal(m.images.length,5);assert.ok(m.images.every(i=>i.image===png&&!i.crop));assert.match(html,/无法判断/);assert.match(html,/遮挡以后/);assert.equal((html.match(/<figure>/g)||[]).length,5);
 assert.doesNotMatch(html,/本次成绩|score-card|100 分|作品与附件|评分依据|耗时|technical-model-code|答题明细|60\/20\/20/);
});
test('historical cloud records use the actual two saved card images and newest valid comparison; never fabricate five pictures',()=>{
 const r=fixture(),d=r.artifacts[0].metadata.visionExperiment;d.records.forEach(row=>delete row.image);
 const m=P.visionProjectionModel(r,'https://teacher.example.test');assert.equal(m.images.length,2);assert.equal(m.images[0].crop,'original');assert.equal(m.images[1].crop,'changed');assert.equal(m.images[1].condition,'模糊 4');assert.ok(m.images.every(r=>r.image==='https://data.example.test/card.png'));assert.match(render(r),/仅保存了实验卡/);
 d.modelVersion='qiong-vision-1.0.0';assert.equal(P.visionProjectionModel(r,'https://teacher.example.test').images.length,0);assert.match(render(r),/已保存的历史实验卡/);
 d.modelVersion='doubao-seed-2-1-pro-260915';d.records[4].specimenId='other';assert.equal(P.visionProjectionModel(r,'https://teacher.example.test').images[1].condition,'模糊 3');
});
test('unavailable data falls back to saved card, missing images get a clear empty state, unsafe URLs and HTML do not execute',()=>{
 const r=fixture();delete r.artifacts[0].metadata.visionExperiment;assert.match(render(r),/legacy-card/);
 r.artifacts=[];assert.match(render(r),/没有可显示的实验图片/);
 const x=fixture();x.student.displayName='<img src=x onerror=alert(1)>';x.artifacts[0].metadata.visionExperiment.observation='<script>alert(1)</script>';x.artifacts[0].metadata.visionExperiment.records[0].image='data:image/svg+xml;base64,AAAA';
 const html=render(x);assert.match(html,/&lt;img/);assert.match(html,/&lt;script/);assert.doesNotMatch(html,/<script|<img src=x|src="data:image\/svg/);
 x.artifacts[0].metadata.visionExperiment.records.forEach(r=>r.image='javascript:alert(1)');x.artifacts[1].url='https://user:password@example.test/card.png';assert.equal(P.visionProjectionModel(x,'https://teacher.example.test').cardUrl,'');
});
test('bounded artifact loader validates experiment structure, omits credentials, and rejects unrelated or oversized data',async()=>{
 let options;const M=load(async(_,o)=>{options=o;return new Response(JSON.stringify(data()));});const result=await M.loadVisionExperiment(artifact);assert.equal(result.records.length,5);assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');
 for(const response of [new Response('{}',{status:503}),new Response('{bad'),new Response(JSON.stringify({...data(),modelVersion:'other'})),new Response('{}',{headers:{'content-length':String(21*1024*1024)}})])await assert.rejects(()=>load(async()=>response).loadVisionExperiment(artifact));
 await assert.rejects(()=>load(async()=>new Response(' '.repeat(20*1024*1024+1))).loadVisionExperiment(artifact));
 await assert.rejects(()=>M.loadVisionExperiment({...artifact,url:'javascript:alert(1)'}));
});
test('platform artifact data uses the current portal proxy instead of depending on cross-origin headers',async()=>{
 let requested;const M=load(async url=>{requested=url;return new Response(JSON.stringify(data()));});
 await M.loadVisionExperiment({...artifact,url:'https://data.example.test/api/v1/course-runtime/artifacts/0123456789abcdef0123456789abcdef/file'});
 assert.equal(requested,'https://teacher.example.test/api/v1/course-runtime/artifacts/0123456789abcdef0123456789abcdef/file');
});
test('actual default projection entry hydrates vision data and keeps existing lesson renderers',async()=>{
 const app=await readFile(new URL('../apps/admin-web/src/App.tsx',import.meta.url),'utf8');assert.match(app,/isVisionProjectionRecord\(record\) && isVisionExperimentArtifact\(artifact\)/);assert.match(app,/return buildVisionProjectionHtml\(record/);assert.match(app,/return buildKilnProjectionHtml\(record/);assert.match(app,/return buildRpsProjectionHtml\(record/);
});
