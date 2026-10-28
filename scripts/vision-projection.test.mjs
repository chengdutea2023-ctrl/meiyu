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
test('projection displays inputs with judgment, observation and compact saved scores without generic attachment panels',()=>{
 const r=fixture(),m=P.visionProjectionModel(r,'https://teacher.example.test'),html=render(r);
 assert.equal(m.images.length,5);assert.ok(m.images.every(i=>i.image===png&&!i.crop));assert.match(html,/无法判断/);assert.match(html,/遮挡以后/);assert.equal((html.match(/<figure>/g)||[]).length,5);
 assert.doesNotMatch(html,/本次成绩|score-card|100 分|作品与附件|评分依据|耗时|technical-model-code|答题明细|60\/20\/20/);
});
test('historical model labels display as computer vision without changing original summary or experiment IDs',()=>{
 const r=fixture(),before=JSON.stringify(r),summary=P.visionPresentationSummary(r.summary);
 assert.equal(summary.resultItems[0].label,'识别方式');assert.equal(summary.resultItems[0].value,'计算机视觉');
 assert.equal(summary.resultItems[1].value,'60/20/20');assert.equal(JSON.stringify(r),before);
 assert.equal(P.visionPresentationSummary(null),null);assert.doesNotMatch(render(r),/doubao|technical-model-code/i);
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

test('projection appends saved questions, all options, student choices and correct answers after pictures and observation',()=>{
 const r=fixture(),d=r.artifacts[0].metadata.visionExperiment;
 d.quizVersion='vision-observation-v3';d.quizResults=Array.from({length:5},(_,i)=>({question:'保存的观察题'+(i+1),options:[{letter:'A',label:'第一个选项'},{letter:'B',label:'第二个选项'},{letter:'C',label:'第三个选项'}],selected:'A. 第一个选项',correctAnswer:'B. 第二个选项',points:0}));
 const before=JSON.stringify(r),html=render(r),m=P.visionProjectionModel(r,'https://teacher.example.test');
 assert.equal(m.quiz.length,5);assert.equal((html.match(/<article>/g)||[]).length,5);assert.equal((html.match(/<li><span>/g)||[]).length,15);assert.match(html,/我的选择：<\/strong>A\. 第一个选项/);assert.match(html,/正确答案：<\/strong>B\. 第二个选项/);
 assert.ok(html.indexOf('class="quiz-review"')>html.indexOf('class="observation"'));assert.ok(html.indexOf('class="quiz-review"')>html.indexOf('class="pictures"'));assert.equal(JSON.stringify(r),before);assert.doesNotMatch(html,/score-card|100 分|作品与附件|评分依据/);
});
test('historical saved quiz wording stays intact; summary fallback never invents a missing correct answer',()=>{
 const r=fixture(),d=r.artifacts[0].metadata.visionExperiment;d.quizVersion='vision-knowledge-v2';d.quizResults=[{question:'历史题：年代资料从哪里来？',selected:'照片资料',correctAnswer:'可查证资料'}];
 let html=render(r);assert.match(html,/历史题：年代资料从哪里来/);assert.doesNotMatch(html,/点击“让 AI 识别”后/);
 delete d.quizResults;r.summary.answers=[{label:'第1题 · 0/10 · 原来保存的问题',value:'我的选择：A. 名称；正确答案：B. 依据；原解释'}];html=render(r);assert.match(html,/原来保存的问题/);assert.match(html,/正确答案：<\/strong>B\. 依据/);
 r.summary.answers=[{label:'旧版两道概念题之一',value:'需要核对可见特征'}];html=render(r);assert.match(html,/正确答案：<\/strong>原记录未保存/);
});
test('saved quiz HTML and malformed options are escaped or ignored without hiding pictures',()=>{
 const r=fixture();r.artifacts[0].metadata.visionExperiment.quizResults=[{question:'<script>bad</script>',selected:'<img src=x onerror=bad>',correctAnswer:'<svg onload=bad>',options:[null,{letter:'<script>',label:'<b>option</b>'}]}];
 const html=render(r);assert.match(html,/&lt;script&gt;bad/);assert.match(html,/&lt;img src=x/);assert.match(html,/A\.|B\./);assert.doesNotMatch(html,/<script>|<svg onload|<img src=x/);assert.equal((html.match(/<figure>/g)||[]).length,5);
});

test('structured summary preserves choices containing punctuation when experiment JSON is unavailable',()=>{
 const r=fixture();delete r.artifacts[0].metadata.visionExperiment;
 const correctAnswer='C. 不一定，仍要核对图片和资料；信息不足时应保留判断';
 r.summary.answers=[{question:'介绍可靠吗？',options:[{letter:'C',label:'不一定；需要核对'}],selected:correctAnswer,correctAnswer,label:'第5题',value:'兼容文字'}];
 const m=P.visionProjectionModel(r,'https://teacher.example.test');assert.equal(m.quiz[0].correctAnswer,correctAnswer);assert.equal(m.quiz[0].options.length,1);assert.match(render(r),/信息不足时应保留判断/);
});


test('projection exposes saved total with concepts fifty and experiment plus observation fifty',()=>{
 const r=fixture();r.status='COMPLETED';r.score=60;
 r.summary.resultItems=[{label:'对照实验',value:'30 / 30'},{label:'观察与解释',value:'20 / 20（仅检查完成度）'},{label:'概念题',value:'10 / 50'}];
 const d=r.artifacts[0].metadata.visionExperiment;d.quizVersion='vision-observation-v3';d.grade={score:60,evidence:30,explanation:20,concepts:10};
 d.quizResults=Array.from({length:5},(_,i)=>({question:'概念题'+i,selected:'A',correctAnswer:'B',points:i===0?10:0}));
 const before=JSON.stringify(r),m=P.visionProjectionModel(r,'https://teacher.example.test'),html=render(r);
 assert.equal(m.score.total,60);assert.equal(m.score.concepts.value,10);assert.equal(m.score.concepts.max,50);assert.equal(m.score.process.value,50);assert.equal(m.score.process.max,50);
 assert.match(html,/本次总分/);assert.match(html,/概念题（50%）/);assert.match(html,/实验与观察（50%）/);assert.match(html,/对照实验 30\/30 · 观察记录 20\/20/);
 assert.match(html,/本题得分：0 \/ 10/);assert.match(html,/本题得分：10 \/ 10/);assert.equal(JSON.stringify(r),before);
});
test('saved current grading can fall back to its JSON but never infer unsaved or unknown historical sub-scores',()=>{
 const r=fixture();r.status='COMPLETED';r.score=50;r.summary.resultItems=[];
 const d=r.artifacts[0].metadata.visionExperiment;d.quizVersion='vision-observation-v3';d.grade={score:50,evidence:30,explanation:20,concepts:0};
 let score=P.visionProjectionModel(r,'https://teacher.example.test').score;assert.equal(score.concepts.value,0);assert.equal(score.process.value,50);
 d.quizVersion='unknown-historical-rule';score=P.visionProjectionModel(r,'https://teacher.example.test').score;assert.equal(score.total,50);assert.equal(score.concepts,null);assert.equal(score.process,null);assert.match(render(r),/未保存分项/);
 d.quizVersion='vision-observation-v3';r.status='STARTED';r.score=null;score=P.visionProjectionModel(r,'https://teacher.example.test').score;assert.equal(score.total,null);assert.equal(score.concepts,null);assert.match(render(r),/未评分/);
});
test('zero is a real saved score, historical ratios stay original, and invalid or inconsistent values are not silently rewritten',()=>{
 const r=fixture();r.score=0;r.summary.resultItems=[{label:'对照实验',value:'0 / 60'},{label:'观察与解释',value:'0 / 20'},{label:'概念题',value:'0 / 20'}];
 let score=P.visionProjectionModel(r,'https://teacher.example.test').score;assert.equal(score.total,0);assert.equal(score.concepts.max,20);assert.equal(score.process.max,80);assert.match(render(r),/历史记录沿用提交时/);
 r.score=60;r.summary.resultItems=[{label:'对照实验',value:'30 / 30'},{label:'观察与解释',value:'20 / 20'},{label:'概念题',value:'50 / 50'}];score=P.visionProjectionModel(r,'https://teacher.example.test').score;assert.equal(score.total,60);assert.match(score.note,/不一致/);
 r.score=NaN;r.summary.resultItems=[{label:'概念题',value:'80 / 50'},{label:'对照实验',value:'-1 / 30'}];score=P.visionProjectionModel(r,'https://teacher.example.test').score;assert.equal(score.total,null);assert.equal(score.concepts,null);assert.equal(score.evidence,null);assert.doesNotMatch(render(r),/NaN/);
});
test('later unfinished uploads cannot replace the submitted experiment or its grading',()=>{
 const r=fixture();r.status='COMPLETED';r.score=60;r.summary.resultItems=[];
 const d=r.artifacts[0].metadata.visionExperiment;d.quizVersion='vision-observation-v3';d.grade={score:60,evidence:30,explanation:20,concepts:10};
 r.summary.artifacts=r.artifacts.map(a=>({kind:a.kind,url:a.url}));
 r.artifacts.push({...artifact,id:'unfinished',url:'https://data.example.test/unfinished.json',metadata:{visionExperiment:{...data(),quizVersion:'vision-observation-v3',grade:{score:100,evidence:30,explanation:20,concepts:50}}}});
 assert.equal(P.visionProjectionModel(r,'https://teacher.example.test').score.concepts.value,10);
});

// Exercise the actual popup workflow, including stale list rows and legacy custom URLs.
async function workflow({blocked=false,origin='https://teacher.example.test/'}={}) {
 const app=await readFile(new URL('../apps/admin-web/src/App.tsx',import.meta.url),'utf8');
 const functions=app.slice(app.indexOf('function openProjectionForRecord('),app.indexOf('function buildDefaultProjectionHtml('));
 const module={exports:{}},writes=[],opened=[],errors=[],hydrated=[];
 const popup={closed:false,opener:{},document:{write:html=>writes.push(html),open(){writes.length=0;},close(){}}};
 vm.runInNewContext(ts.transpileModule(functions+'\nmodule.exports={openProjectionForRecord,openDefaultProjectionPage};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  module,exports:module.exports,window:{location:{href:origin},open:(...args)=>{opened.push(args);return blocked?null:popup;}},
  message:{error:s=>errors.push(s)},isPlainObject:v=>v&&typeof v==='object',isVisionProjectionRecord:P.isVisionProjectionRecord,isVisionExperimentArtifact:P.isVisionExperimentArtifact,
  loadVisionExperiment:async a=>{hydrated.push(a.id);return a.metadata.visionExperiment;},
  isKilnProjectionRecord:()=>false,isRestorationProjectionRecord:()=>false,isRestorationPackageArtifact:()=>false,isYoloQuestionnaire:()=>false,
  getProjectionUrl:s=>s?.projectorUrl||null,buildDefaultProjectionHtml:r=>P.buildVisionProjectionHtml(r,origin),
 });
 return {...module.exports,writes,opened,errors,hydrated,popup};
}
test('teacher and student popup paths refresh the same saved record before hydrating and render identical results',async()=>{
 const saved=fixture();saved.id='same-record';saved.status='COMPLETED';saved.score=60;
 saved.summary.resultItems=[{label:'对照实验',value:'30 / 30'},{label:'观察与解释',value:'20 / 20'},{label:'概念题',value:'10 / 50'}];
 saved.artifacts[0].metadata.visionExperiment.quizResults=[{question:'观察题',selected:'A. 我的选择',correctAnswer:'B. 正确答案',points:0}];
 const stale={...saved,score:100,artifacts:[],summary:{projectorUrl:'https://old.example.test/projector/legacy'}};
 const t=await workflow(),s=await workflow({origin:'https://student.example.test/'});let reads=0;
 for(const w of [t,s]){
  await w.openDefaultProjectionPage(stale,async()=>{reads++;return saved;});
  assert.equal(w.hydrated.length,1);assert.match(w.writes[0],/60 <small>/);assert.match(w.writes[0],/正确答案/);assert.equal((w.writes[0].match(/<figure>/g)||[]).length,5);
 }
 assert.equal(reads,2);assert.equal(t.writes[0],s.writes[0]);
 const routed=await workflow();routed.openProjectionForRecord(stale,async()=>saved);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(routed.opened[0][0],'');assert.match(routed.writes[0],/60 <small>/);
});
test('latest-record failures and mismatched IDs never silently project stale cached data',async()=>{
 for(const reader of [async()=>{throw new Error('expired session');},async()=>({...fixture(),id:'different'})]){
  const w=await workflow();await w.openDefaultProjectionPage({...fixture(),id:'original'},reader);
  assert.match(w.writes[0],/读取最新学习记录失败/);assert.doesNotMatch(w.writes[0],/本次总分|expired session/);assert.equal(w.hydrated.length,0);
 }
 const w=await workflow({blocked:true});let reads=0;await w.openDefaultProjectionPage(fixture(),async()=>{reads++;return fixture();});assert.equal(reads,0);assert.equal(w.errors.length,1);
});
test('unrelated courseware retains its custom URL; every portal projection entry uses the role-scoped current-record reader',async()=>{
 const w=await workflow(),r={...fixture(),courseware:{slug:'other',title:'其他课件'},summary:{projectorUrl:'https://other.example.test/projector'}};
 w.openProjectionForRecord(r);assert.equal(w.opened[0][0],r.summary.projectorUrl);
 const app=await readFile(new URL('../apps/admin-web/src/App.tsx',import.meta.url),'utf8');
 assert.match(app,/mode === 'teacher' \? api.getTeacherLearningRecord\(record.id\) : api.getStudentLearningRecord\(record.id\)/);
 const portal=app.slice(app.indexOf('  const projectRecord = (record: LearningRecord)'),app.indexOf('\nfunction ',app.indexOf('  const projectRecord = (record: LearningRecord)')));
 assert.doesNotMatch(portal,/onProject[=:]\s*\{?openProjectionForRecord|onClick=\{\(\) => openProjectionForRecord/);
 assert.equal((portal.match(/onProject: projectRecord|onProject=\{projectRecord\}|onClick=\{\(\) => projectRecord/g)||[]).length,4);
});
