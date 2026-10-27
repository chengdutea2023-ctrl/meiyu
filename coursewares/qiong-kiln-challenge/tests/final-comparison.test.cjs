const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../static/engine.js'),D=require('../static/demonstrations.js'),F=require('../static/final-learning.js'),C=require('../static/final-comparison.js'),Q=require('../static/quiz.js');
const finalSeed=C.seedFromEntropy(500001);
const input=require('./helpers/combined-fixture.cjs').inputs(),snapshots=input.snapshots,learning=F.learn(snapshots,input.demonstrationLibrary,input.practiceLibrary);
function fixture(){
 const s=E.create(finalSeed,E.CLASSROOM_PROFILE.disturbance,E.CLASSROOM_PROFILE),rng=E.random(30);
 while(!s.done)E.step(s,E.choose(learning.qTable,s,rng));
 const first={mode:'manual',success:false,result:'持续过热炸膛',energy:22,steps:1,trace:[{tick:0,temp:20},{tick:1,temp:95}]};
 return {snapshots,records:[first,{...first,success:true,result:'烧成合格'}],finalSeed,finalLearning:learning,finalRecord:{mode:'ai',seed:finalSeed,purpose:C.VERSION,finalRunId:'final-1',finalLearningId:learning.id,sourceExperimentIds:learning.sources.map(s=>s.trainingExperimentId),success:s.success,result:s.reason,energy:s.energy,steps:s.tick,trace:s.trace,playback:{activeSeconds:30}}};
}
test('final comparison binds the first manual attempt, combined three-group learning and a separate real replay',()=>{
 const s=fixture(),before=JSON.stringify(s),c=C.current(s);assert.ok(c);assert.equal(c.baseline.success,false);assert.equal(c.baseline.result,'持续过热炸膛');assert.equal(c.ai.success,s.finalRecord.success);assert.equal(c.policy.kind,F.VERSION);assert.deepEqual(c.policy.learning.sources.map(s=>s.trainingExperimentId),[1,2,3]);assert.equal(JSON.stringify(s),before);
 c.baseline.result='changed';assert.notEqual(s.records[0].result,'changed');
 const compact=C.compact(C.current(s));assert.ok(!compact.ai.trace);assert.ok(!compact.baseline.trace);assert.ok(!compact.policy.qTable);assert.match(compact.scope,/不直接比较能耗/);
});
test('training demonstrations, partial playback, two groups or a different policy cannot complete the final stage',()=>{
 for(const change of [s=>{s.snapshots=s.snapshots.slice(0,2);},s=>{s.records=[];},s=>{s.finalRecord=null;},s=>{delete s.finalRecord.purpose;},s=>{s.finalRecord.playback.activeSeconds=29.9;},s=>{delete s.finalRecord.playback;},s=>{s.finalLearning=null;},s=>{s.finalRecord.finalLearningId='other';},s=>{s.finalRecord.sourceExperimentIds=[1,2];},s=>{s.finalRecord.trace=[];}]){const s=fixture();change(s);assert.equal(C.current(s),null);}
});
test('all four real outcome pairs generate truthful, evidence-bound five-question sets',()=>{
 const outcome=new Set();for(const manualSuccess of [false,true])for(const aiSuccess of [false,true]){
  const s=fixture();s.records[0].success=manualSuccess;s.finalRecord.success=aiSuccess;s.records[0].result=manualSuccess?'烧成合格':'烧成不足';s.finalRecord.result=aiSuccess?'烧成合格':'过热损坏';
  const c=C.current(s),questions=Q.comparisonQuestions(c);assert.equal(questions.length,5);assert.equal(new Set(questions.map(q=>q.id)).size,5);outcome.add(questions[0].correct);
  for(const q of questions){assert.equal(q.options.length,3);assert.equal(q.options.filter(o=>o.value===q.correct).length,1);assert.ok(q.explanation);}
  assert.equal(questions[1].correct,c.actions.join('-'));assert.equal(questions[2].correct,String(c.decision.action));assert.match(questions[2].title,new RegExp(c.decision.temperatureCelsius+'℃'));
  assert.equal(questions[3].id,'final-learning-v3');assert.match(questions[3].options.find(o=>o.value===questions[3].correct).text,/汇总三组.*独立验证/);assert.doesNotMatch(questions[3].explanation,/不合并三组|选定组保存/);
  for(let correct=0;correct<=5;correct++){
   const answers=Object.fromEntries(questions.map((q,i)=>[q.id,i<correct?q.correct:q.options.find(o=>o.value!==q.correct).value])),result=Q.evaluate(answers,true,questions);
   assert.equal(result.total,50+correct*10);assert.equal(result.correctCount,correct);assert.equal(Q.evaluate(answers,false,questions).processPoints,0);assert.equal(result.items[0].question,questions[0].title);
  }
 }
 assert.equal(outcome.size,4);assert.deepEqual(Q.comparisonQuestions(null),[]);
});
test('final AI replay and evidence do not modify the combined Q table, sources or first manual record',()=>{
 const s=fixture(),before=JSON.stringify({snapshots:s.snapshots,learning}),c=C.current(s),actions=[...new Set(s.finalRecord.trace.slice(1).map(t=>t.action))].sort();
 assert.deepEqual(c.actions,actions);const i=s.finalRecord.trace.findIndex((p,i)=>i>0&&p.action===2);assert.equal(c.decision.action,s.finalRecord.trace[Math.max(1,i)].action);assert.equal(JSON.stringify({snapshots:s.snapshots,learning}),before);
 for(const entropy of [0,1,500001,0xffffffff]){const seed=C.seedFromEntropy(entropy);assert.ok(seed>=9000000&&seed<109000000);assert.ok(!D.SEEDS.includes(seed));assert.ok(!E.CLASSROOM_EVAL_SEEDS.includes(seed));assert.ok(!Array.from({length:300},(_,i)=>D.CONFIG.practiceSeed+67*i).includes(seed));assert.equal(seed,C.seedFromEntropy(entropy));}
 for(const invalid of [-1,1.1,NaN,0x100000000])assert.throws(()=>C.seedFromEntropy(invalid));
});
test('result explanation uses the earliest manual result and the actual final AI result for all four outcome pairs',()=>{
 const conclusions=new Set();
 for(const manualSuccess of [false,true])for(const aiSuccess of [false,true]){
  const state=fixture();state.records[0].success=manualSuccess;state.records[0].result=manualSuccess?'烧成合格':'持续过热炸膛';state.finalRecord.success=aiSuccess;state.finalRecord.result=aiSuccess?'烧成合格':'烧成不足';
  const c=C.current(state),summary=c.outcomeSummary;assert.equal(summary.aiResult,`AI烧制：${state.finalRecord.result}。`);assert.equal(summary.manualResult,`人工烧制（首次）：${state.records[0].result}。`);assert.deepEqual(summary,C.describeOutcome(c.baseline,c.ai));conclusions.add(summary.conclusion);
  const saved=C.compact(c);assert.deepEqual(saved.outcomeSummary,summary);saved.outcomeSummary.conclusion='changed';assert.notEqual(c.outcomeSummary.conclusion,'changed');
  assert.doesNotMatch(summary.conclusion,/能耗更低|节能更多|AI一定|人一定/);
 }
 assert.equal(conclusions.size,4);
});
test('comparison metrics use the first manual kiln and independent AI batch without inventing success rates',()=>{
 const s=fixture(),c=C.current(s);assert.equal(c.presentationVersion,C.PRESENTATION);assert.deepEqual(c.metrics.manual,{passed:0,samples:1,rate:0,scope:'earliest-manual-single-kiln'});assert.equal(c.metrics.ai.passed,learning.test.passed);assert.equal(c.metrics.ai.samples,learning.test.samples);assert.equal(c.metrics.ai.scope,'independent-final-policy-test');assert.deepEqual(C.compact(c).metrics,c.metrics);
 assert.match(C.rateText(c.metrics.manual),/0%（0\/1窑，首次单窑）/);
 assert.equal(C.metrics({success:true},{test:{passed:0,samples:100}}).ai.rate,0);
 assert.equal(C.metrics({success:true},{test:{passed:79,samples:100}}).ai.rate,79);
 assert.equal(C.metrics({success:true},{test:{passed:1,samples:0}}).ai,null);assert.equal(C.metrics({success:true},{test:{passed:101,samples:100}}).ai,null);assert.equal(C.metrics({success:true},null).ai,null);assert.equal(C.rateText(null),'未记录');
});
test('current five-question bank follows combined learning and the final observed firing, not retired reward choices',()=>{
 const c=C.current(fixture()),questions=Q.comparisonQuestions(c);assert.equal(questions.length,5);
 assert.deepEqual(questions.map(q=>q.id),['final-outcome-v1','final-actions-v1','final-decision-v1','final-learning-v3','final-evidence-v1']);
 assert.doesNotMatch(JSON.stringify(questions),/优先烧好|优先节能|两套|选定一组|选定组保存/);
 assert.match(questions[3].options.find(o=>o.value===questions[3].correct).text,/汇总三组示范和试错经验继续学习/);
 assert.match(questions[4].options.find(o=>o.value===questions[4].correct).text,/单窑不代表稳定合格率/);
});
