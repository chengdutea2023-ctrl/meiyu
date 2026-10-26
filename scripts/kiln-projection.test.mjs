import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), T=require('../coursewares/qiong-kiln-challenge/static/temperature.js');
const source=await readFile(new URL('../apps/admin-web/src/kiln-projection.ts',import.meta.url),'utf8');
function moduleFor(fetcher=fetch) {
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {module,exports:module.exports,URL,TextDecoder,AbortController,fetch:fetcher,window:{location:{href:'https://student.example.test/'},setTimeout,clearTimeout}});
 return module.exports;
}
const P=moduleFor();
const artifact={id:'fixture',kind:'experiment-data',mimeType:'application/json',originalFileName:'qiong-kiln-experiments.json',fileName:'fixture.json',url:'https://student.example.test/fixture.json',metadata:{},sizeBytes:1000,createdAt:''};
const trial=(energy,rate=100)=>({episodes:3000,rewards:{success:100,damage:80,energy,time:1},before:{rate:10},after:{samples:30,rate,energy:rate?22.1:0,steps:rate?9.1:22},policyAfter:{trace:[{tick:0,temp:20},{tick:1,temp:58},{tick:2,temp:80},{tick:3,temp:30}]}});
const data={title:'邛窑AI烧窑挑战',records:[{mode:'manual',result:'烧成合格',energy:19,steps:8,trace:[{tick:0,temp:20},{tick:1,temp:58},{tick:2,temp:30}]},{mode:'fixed',result:'烧成合格',energy:21,steps:9}],trainingExperiments:[trial(1),trial(1),trial(5,0),trial(1),trial(5,0)],finding:'改变奖励，会影响AI的选择。'};
const fixture=()=>({id:'fixture',courseware:{slug:'qiong-kiln-challenge',title:'邛窑AI烧窑挑战'},course:{title:'邛窑AI探究'},student:{displayName:'投屏测试学生',email:'fixture@example.invalid'},status:'COMPLETED',score:100,durationSeconds:459,summary:{brief:'完成三种模式比较与5组AI奖励实验。',resultItems:[{label:'我的发现',value:data.finding},{label:'概念理解',value:'理解AI通过试错更新动作价值'}]},artifacts:[{...artifact,metadata:{kilnExperiment:structuredClone(data)}}]});
const render=r=>P.buildKilnProjectionHtml(r,{imageUrl:'/assets/kiln.png',baseUrl:'https://student.example.test/'});
test('kiln projection is scoped to its courseware and only loads its exact experiment artifact',()=>{
 assert.equal(P.isKilnProjectionRecord(fixture()),true);
 assert.equal(P.isKilnProjectionRecord({...fixture(),courseware:{slug:'birdai',title:'观鸟小课堂'}}),false);
 assert.equal(P.isKilnExperimentArtifact(artifact),true);
 assert.equal(P.isKilnExperimentArtifact({...artifact,kind:'report'}),false);
 assert.equal(P.isKilnExperimentArtifact({...artifact,originalFileName:'other.json'}),false);
});
test('projection shows each reward latest result without losing repeat history or turning zero into missing',()=>{
 const model=P.kilnProjectionModel(fixture());
 assert.equal(model.experimentsCount,5);assert.equal(model.rewardCount,2);assert.equal(model.rows.length,4);
 assert.equal(model.rows[0].rate,null);assert.equal(model.rows[0].basis,'单窑记录');
 assert.equal(model.rows[3].rate,0);assert.equal(model.rows[3].energy,0);assert.equal(model.rows[3].basis,'30窑测试');
 assert.match(render(fixture()),/全部训练记录 · 5次/);
});
test('projection historical temperature conversion exactly matches the current lesson and new Celsius traces',()=>{
 for(let i=0;i<=1000;i++)assert.equal(P.kilnProjectionCelsius(i/10),T.celsius(i/10));
 const r=fixture();r.artifacts[0].metadata.kilnExperiment.records[0].trace[1].temperatureCelsius=1001;
 assert.equal(P.kilnProjectionModel(r).rows[0].trace[1].temperature,1001);
 assert.throws(()=>P.kilnProjectionCelsius(NaN));
});
test('balanced energy reports retain the preference label and old failed records remain unchanged',()=>{
 const r=fixture(),d=r.artifacts[0].metadata.kilnExperiment;
 d.trainingExperiments=[trial(1),{...trial(2),after:{samples:30,rate:100,energy:19,steps:7.8}}];
 const rows=P.kilnProjectionModel(r).rows;
 assert.equal(rows.at(-1).name,'AI · 优先节能');assert.equal(rows.at(-1).energy,19);assert.equal(rows.at(-1).rate,100);
 const legacy=P.kilnProjectionModel(fixture()).rows.at(-1);assert.equal(legacy.name,'AI · 优先节能');assert.equal(legacy.rate,0);assert.equal(legacy.energy,0);
});
test('demonstration reports group by validated combination rather than identical rewards',()=>{
 const r=fixture(),d=r.artifacts[0].metadata.kilnExperiment;
 d.demonstrationVersion='demonstrations-v1';d.lessonFlow='manual-demonstrations-ai';d.records=d.records.filter(r=>r.mode==='manual');
 const demo=(selectedTypes,rate)=>({...trial(1),demonstrationVersion:'demonstrations-v1',selectedTypes,combinationId:selectedTypes.join('+'),episodes:300,afterDemonstrations:{rate:17},after:{samples:100,rate,energy:29,steps:11}});
 const a=demo(['steady','rush','low'],91),b=demo(['rush','early','alternate'],0);d.trainingExperiments=[a,{...a,after:{...a.after,rate:92}},b];
 const m=P.kilnProjectionModel(r),html=render(r);assert.equal(m.demonstrations,true);assert.equal(m.twoStage,true);assert.equal(m.rewardCount,2);assert.equal(m.experimentsCount,3);assert.equal(m.rows.length,3);assert.equal(m.rows[1].rate,92);assert.equal(m.rows[1].before,17);assert.equal(m.rows[2].rate,0);
 assert.match(html,/参考示范后 → 练习后/);assert.match(html,/猛火冲刺型/);assert.match(html,/套不同示范组合/);assert.doesNotMatch(html,/优先烧好|优先节能|组不同奖励方案/);
 d.trainingExperiments.push({...a,combinationId:b.combinationId},{...b,episodes:10,stopped:true});assert.equal(P.kilnProjectionModel(r).rewardCount,2);
 r.summary.demonstrationVersion='demonstrations-v1';r.summary.lessonFlow='manual-demonstrations-ai';r.summary.trainingExperimentCount=3;r.summary.demonstrationComparisons=[a,b];r.artifacts=[];
 const fallback=P.kilnProjectionModel(r);assert.equal(fallback.rewardCount,2);assert.equal(fallback.rows.length,2);assert.equal(fallback.rows[1].rate,0);assert.match(render(r),/详细实验数据暂未读取/);assert.doesNotMatch(render(r),/<polyline/);
});
test('two-stage reports compare manual with both AI rewards while historical records retain program results',()=>{
 const r=fixture(),d=r.artifacts[0].metadata.kilnExperiment;
 d.lessonFlow='manual-ai';d.records=d.records.filter(r=>r.mode==='manual');d.trainingExperiments=[trial(1),trial(5,0)];r.summary.brief='';
 const model=P.kilnProjectionModel(r),html=render(r);
 assert.equal(model.twoStage,true);assert.equal(model.rows.length,3);assert.equal(model.rewardCount,2);
 assert.match(html,/手动与AI的实验对比/);assert.doesNotMatch(html,/三种方式|程序烧|固定程序/);
 assert.match(render(fixture()),/三种方式的真实表现/);assert.match(render(fixture()),/程序烧/);
 r.artifacts=[];r.summary.lessonFlow='manual-ai';
 assert.equal(P.kilnProjectionModel(r).twoStage,true);assert.match(render(r),/手动与AI的实验对比/);
});
test('historical summary fallback does not invent charts, test percentages or missing scores',()=>{
 const r=fixture();r.artifacts=[];r.score=null;
 r.summary.resultItems.push({label:'实验数据（系统整理）',value:'我来烧：烧成合格，能耗19，8步。\n程序烧：烧成合格，能耗21，9步。\n优先节能：测试30窑，合格率0%，平均能耗0，平均22步。'});
 const model=P.kilnProjectionModel(r),html=render(r);
 assert.equal(model.rows.length,3);assert.equal(model.rows[0].rate,null);assert.equal(model.rows[2].rate,0);assert.equal(model.experimentsCount,null);
 assert.match(html,/未评分/);assert.match(html,/未绘制推测数据/);assert.doesNotMatch(html,/<polyline/);
});
test('real-time manual curves preserve samples beyond step 22 on a separate seconds axis',()=>{
 const r=fixture(),d=r.artifacts[0].metadata.kilnExperiment;
 d.records=[{mode:'manual',manualControlVersion:'realtime-v1',result:'烧成合格',simulatedDurationSeconds:31,energy:17,steps:1,
  trace:Array.from({length:32},(_,i)=>({tick:i,elapsedSeconds:i,temp:i<17?20+i*3.6:79.4-(i-17)*3.2}))}];
 const model=P.kilnProjectionModel(r),html=render(r);
 assert.equal(model.rows[0].trace.length,32);assert.equal(model.rows[0].realtime,true);assert.match(model.rows[0].basis,/31秒/);
 assert.match(html,/时间0至60秒/);assert.match(html,/操作步数0至22/);assert.match(html,/次切换/);assert.match(html,/不作同条件胜负比较/);assert.doesNotMatch(html,/NaN|undefined/);
 d.records[0].trace.push({tick:33,elapsedSeconds:29,temp:10},{tick:34,temp:10},{tick:35,elapsedSeconds:61,temp:10});
 assert.equal(P.kilnProjectionModel(r).rows[0].trace.length,32);
 r.artifacts=[];r.summary.resultItems.push({label:'实验数据（系统整理）',value:'我来烧：烧成合格，能耗16.6，实时30.6秒，切换1次。'});
 assert.equal(P.kilnProjectionModel(r).rows[0].realtime,true);assert.match(render(r),/30.6秒/);assert.doesNotMatch(render(r),/<polyline/);
});
test('projection escapes learner text and rejects executable or credential-bearing URLs',()=>{
 const r=fixture();r.student.displayName='<img src=x onerror=alert(1)>';
 r.summary.resultItems[0].value='<script>alert(1)</script>';
 r.artifacts.push({...artifact,url:'javascript:alert(1)'},{...artifact,url:'https://user:pass@example.invalid/file'});
 const html=render(r);assert.match(html,/&lt;img/);assert.match(html,/&lt;script/);assert.doesNotMatch(html,/<script|<img src=x|href="javascript:|user:pass@/);
 assert.match(html,/https:\/\/student.example.test\/assets\/kiln.png/);
});
test('bounded experiment loader decodes JSON without sending credentials',async()=>{
 let init;
 const M=moduleFor(async(_url,options)=>{init=options;return new Response(JSON.stringify(data));});
 const result=await M.loadKilnExperiment(artifact);
 assert.equal(result.title,data.title);assert.equal(init.credentials,'omit');
});
test('experiment loader rejects failed, oversized, malformed and unrelated reports',async()=>{
 for(const response of [new Response('{}',{status:503}),new Response('{}',{headers:{'content-length':String(9*1024*1024)}}),new Response('{bad'),new Response(JSON.stringify({...data,title:'other lesson'}))]){
  await assert.rejects(()=>moduleFor(async()=>response).loadKilnExperiment(artifact));
 }
 const huge=new Response(' '.repeat(8*1024*1024+1));
 await assert.rejects(()=>moduleFor(async()=>huge).loadKilnExperiment(artifact));
});
test('default projection integrates kiln hydration while retaining other existing renderers',async()=>{
 const app=await readFile(new URL('../apps/admin-web/src/App.tsx',import.meta.url),'utf8');
 assert.match(app,/isKilnProjectionRecord\(record\) && isKilnExperimentArtifact\(artifact\)/);
 assert.match(app,/return buildKilnProjectionHtml\(record/);
 assert.match(app,/return buildRpsProjectionHtml\(record/);
 assert.match(app,/loadQuestionnaire\(artifact\)/);
});
