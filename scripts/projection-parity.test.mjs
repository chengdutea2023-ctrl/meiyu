import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const source=await readFile(new URL('../apps/admin-web/src/App.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations=new Map();
for(const node of ast.statements){
 if(ts.isFunctionDeclaration(node)&&node.name)declarations.set(node.name.text,node);
 if(ts.isVariableStatement(node))for(const declaration of node.declarationList.declarations){
  if(ts.isIdentifier(declaration.name))declarations.set(declaration.name.text,node);
 }
}
const transpile=code=>ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
// Execute the production routing/helpers, including generic and RPS rendering, not a second template.
function dependencyCode(roots){
 const selected=new Set();
 function visit(name){
  const node=declarations.get(name);if(!node||selected.has(node))return;
  selected.add(node);
  function walk(child){if(ts.isIdentifier(child)&&declarations.has(child.text))visit(child.text);ts.forEachChild(child,walk);}
  walk(node);
 }
 roots.forEach(visit);
 return ast.statements.filter(node=>selected.has(node)).map(node=>node.getText(ast)).join('\n');
}
const renderCode=dependencyCode(['buildDefaultProjectionHtml','openProjectionForRecord']);
const sharedModules=await Promise.all(['kiln-projection','vision-projection','restoration-projection','questionnaire-report'].map(async name=>[name,await readFile(new URL(`../apps/admin-web/src/${name}.ts`,import.meta.url),'utf8')]));
function portal(role,fetcher=()=>{throw Error('Unexpected artifact request');}){
 const origin=`https://${role}.example.test`,windows=[];
 const window={location:{href:origin+'/'},setTimeout,clearTimeout,open:(url,target,features)=>{
  const popup={url,target,features,closed:false,opener:{},html:'',document:{open(){popup.html='';},write(html){popup.html+=html;},close(){}}};
  windows.push(popup);return popup;
 }};
 const context={URL,TextDecoder,Uint8Array,AbortController,require,fetch:fetcher,window,btoa:s=>Buffer.from(s,'binary').toString('base64'),kilnProjectionImage:'https://assets.example.test/kiln.png',message:{error(){throw Error('Popup blocked');}}};
 for(const [,code] of sharedModules){
  const module={exports:{}};vm.runInNewContext(transpile(code),{...context,module,exports:module.exports});Object.assign(context,module.exports);
 }
 const module={exports:{}};
 vm.runInNewContext(transpile(renderCode+'\nmodule.exports={buildDefaultProjectionHtml,openProjectionForRecord,openDefaultProjectionPage};'),{...context,module,exports:module.exports});
 return {...module.exports,windows,origin};
}
const fixture=(slug,title,summary={},artifacts=[])=>({id:'same-record',course:{slug:'qiong-ai-inquiry',title:'同一门课程'},courseware:{slug,title},student:{id:'student-fixture',displayName:'投屏验收学生',email:'fixture@example.invalid'},class:{name:'验收班'},assignment:{title:'验收任务'},status:'COMPLETED',score:80,durationSeconds:120,summary,artifacts});
const normalize=html=>html.replaceAll(/https:\/\/(teacher|student|data)\.example\.test/g,'https://portal.example.test');
const groups=[['steady','rush','low'],['steady','rush','early'],['steady','low','alternate']].map((selectedTypes,i)=>({trainingExperimentId:i+1,selectedTypes,combinationId:selectedTypes.join('+')}));
const finalComparison={version:'final-ai-comparison-v2',key:'final-fixture',presentationVersion:'manual-ai-results-v1',baseline:{success:true,result:'烧成合格',energy:19},ai:{success:false,result:'烧成不足',energy:26},metrics:{manual:{passed:1,samples:1,scope:'earliest-manual-single-kiln'},ai:{passed:92,samples:100,scope:'independent-final-policy-test'}},policy:{kind:'combined-experience-v1',learning:{version:'combined-experience-v1',sources:groups,demonstrationCount:180,sourcePracticeEpisodes:900,additionalPracticeEpisodes:300,test:{samples:100,passed:92,energy:27}}}};
const cases=[
 fixture('qiong-kiln-challenge','邛窑AI烧窑挑战',{lessonFlow:'manual-combined-experience-ai',demonstrationVersion:'demonstrations-v1',requiredCombinationCount:3,finalComparison,resultItems:[{label:'本次对照结论（系统整理）',value:'人工合格，AI本窑未合格。'}]}),
 fixture('qiong-kiln-challenge','邛窑AI烧窑挑战',{lessonFlow:'manual-demonstrations-ai',demonstrationVersion:'demonstrations-v1',requiredCombinationCount:3,resultItems:[{label:'本次对照结论（系统整理）',value:'本次两次均合格。'}]}),
 fixture('qiong-kiln-challenge','邛窑AI烧窑挑战',{lessonFlow:'manual-ai',resultItems:[{label:'我的发现',value:'历史奖励实验'}]}),
 fixture('courseware','邛窑 -AI看见了什么',{scoreText:'80分（实验过程）',processSummary:'遮挡会影响识别'}),
 fixture('courseware-is9nlxd12','邛窑AI修复挑战',{workflowVersion:2,proposalId:'proposal-fixture',brief:'根据文物线索修复'}),
 fixture('rps','AI 猜拳擂台',{displayTitle:'AI 猜拳擂台',rounds:[{roundNumber:1,playerMove:'rock',aiMove:'scissors',result:'win'}]}),
 fixture('yolo-environment-recognition','环境物体识别',{brief:'问卷已提交，待评价',resultItems:[{label:'观察',value:'识别到桌椅'}]}),
 fixture('birdai','观鸟小课堂',{imageUrl:'https://assets.example.test/bird.png',answers:[{label:'鸟类',value:'白头鹎'}]}),
 fixture('bird-migration-lab','候鸟迁徙实验室',{resultItems:[{label:'路线',value:'跨太平洋迁徙'}]}),
 fixture('four-panel-story-studio','AI四格故事工坊',{images:['https://assets.example.test/story.png']}),
 fixture('generic-unscored','未评分作品',{brief:'等待评价'}),
];
test('every shared projection template is identical for teacher, student and administrator viewing the same record',()=>{
 for(const record of cases){
  const before=JSON.stringify(record),outputs=['teacher','student','data'].map(role=>normalize(portal(role).buildDefaultProjectionHtml(structuredClone(record))));
  assert.equal(outputs[0],outputs[1],record.courseware.slug+' teacher/student');assert.equal(outputs[0],outputs[2],record.courseware.slug+' teacher/admin');
  assert.match(outputs[0],/投屏验收学生/);assert.equal(JSON.stringify(record),before);
 }
 const unscored={...cases.at(-1),score:null};assert.match(portal('student').buildDefaultProjectionHtml(unscored),/未评分/);
 const current=portal('teacher').buildDefaultProjectionHtml(cases[0]);assert.match(current,/人工烧制与AI烧制对照/);assert.match(current,/92%（92\/100窑，独立测试）/);assert.doesNotMatch(current,/操作记录|程序烧|优先节能/);
});
test('all portal projection buttons use one record callback, including assignment lists and student detail',()=>{
 const callbacks=[];
 function walk(node){
  if(ts.isJsxAttribute(node)&&node.name.getText(ast)==='onProject')callbacks.push(node.initializer?.getText(ast));
  if(ts.isPropertyAssignment(node)&&node.name.getText(ast)==='onProject')callbacks.push(node.initializer.getText(ast));
  ts.forEachChild(node,walk);
 }
 walk(ast);assert.ok(callbacks.length>=3);assert.ok(callbacks.every(value=>/^\{?openProjectionForRecord\}?$/.test(value)));
 assert.match(source,/onClick=\{\(\) => openProjectionForRecord\(record\)\}/);
 assert.doesNotMatch(declarations.get('buildDefaultProjectionHtml').getText(ast),/userType|isPlatformAdmin|portalType/);
});
test('shared loader hydrates the same submitted artifact for either portal before rendering',async()=>{
 const data={title:'邛窑AI烧窑挑战',lessonFlow:'manual-demonstrations-ai',demonstrationVersion:'demonstrations-v1',records:[],trainingExperiments:[],finding:'保留本次真实数据'};
 const artifact={id:'experiment',kind:'experiment-data',originalFileName:'qiong-kiln-experiments.json',mimeType:'application/json',url:'https://assets.example.test/report.json',sizeBytes:100};
 const record=fixture('qiong-kiln-challenge','邛窑AI烧窑挑战',{},[artifact]),before=JSON.stringify(record),outputs=[];
 for(const role of ['teacher','student','data']){
  let requests=0;const p=portal(role,async url=>{assert.equal(String(url),artifact.url);requests++;return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});});
  await p.openDefaultProjectionPage(record);assert.equal(requests,1);assert.equal(p.windows[0].opener,null);assert.match(p.windows[0].html,/保留本次真实数据/);outputs.push(normalize(p.windows[0].html));
 }
 assert.equal(outputs[0],outputs[1]);assert.equal(outputs[0],outputs[2]);assert.equal(JSON.stringify(record),before);
});
test('custom projection URLs are opened unchanged by the same callback on both portals',()=>{
 for(const role of ['teacher','student','data']){
  const p=portal(role),record=fixture('custom','自定义投屏',{projectorUrl:'https://assets.example.test/projection.html'});
  p.openProjectionForRecord(record);assert.equal(p.windows.length,1);assert.equal(p.windows[0].url,'https://assets.example.test/projection.html');assert.equal(p.windows[0].features,'noopener,noreferrer');
 }
});
test('teacher/student list and detail APIs serialize the same projection data without widening record access',async()=>{
 const service=await readFile(new URL('../platform/api/src/modules/portal/portal.service.ts',import.meta.url),'utf8');
 const tree=ts.createSourceFile('portal.service.ts',service,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const names=['teacherLearningRecords','teacherLearningRecord','studentLearningRecords','studentLearningRecord','learningRecordInclude','toLearningRecord'];
 const klass=tree.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='PortalService');
 const methods=klass.members.filter(node=>names.includes(node.name?.getText(tree)));
 assert.equal(methods.length,names.length);
 const module={exports:{}};
 vm.runInNewContext(transpile('class PortalFixture{'+methods.map(n=>n.getText(tree)).join('\n')+'}\nmodule.exports=PortalFixture;'),{module,exports:module.exports,UserType:{TEACHER:'TEACHER',STUDENT:'STUDENT'},CourseAssignmentStatus:{ACTIVE:'ACTIVE'}});
 const p=new module.exports(),queries=[],record={...cases[0],artifacts:[{id:'image',publicUrl:'https://assets.example.test/result.png',metadata:{evidence:'原始附件'},kind:'work',mimeType:'image/png'}]};
 p.prisma={learningRecord:{findMany:async query=>{queries.push(query);return [record];},findFirst:async query=>{queries.push(query);return record;}}};
 const checked=[];p.ensureRole=async(user,role)=>checked.push([user,role]);p.studentClassIds=async()=>['class-fixture'];
 const teacher=await p.teacherLearningRecords('teacher-fixture',{}),student=await p.studentLearningRecords('student-fixture');
 const teacherDetail=await p.teacherLearningRecord('teacher-fixture','same-record'),studentDetail=await p.studentLearningRecord('student-fixture','same-record');
 assert.equal(JSON.stringify(teacher.records[0]),JSON.stringify(student.records[0]));assert.equal(JSON.stringify(teacherDetail),JSON.stringify(studentDetail));
 for(const query of queries){assert.equal(JSON.stringify(query.include),JSON.stringify(queries[0].include));assert.ok(query.include.artifacts);}
 assert.equal(queries[0].where.assignment.is.teacherId,'teacher-fixture');assert.equal(queries[1].where.studentId,'student-fixture');assert.equal(queries[2].where.assignment.is.teacherId,'teacher-fixture');assert.equal(queries[3].where.studentId,'student-fixture');assert.equal(checked.length,4);
});
