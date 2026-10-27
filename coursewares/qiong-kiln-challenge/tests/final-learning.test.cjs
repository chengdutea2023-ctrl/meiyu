const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../static/engine.js'),D=require('../static/demonstrations.js'),F=require('../static/final-learning.js');
const {inputs}=require('./helpers/combined-fixture.cjs');
const input=inputs(),learn=v=>F.learn(v.snapshots,v.demonstrationLibrary,v.practiceLibrary);
test('combined learning consumes actual experiences from all three groups without mutating or averaging their Q tables',()=>{
 const before=JSON.stringify(input),f=learn(input);assert.equal(JSON.stringify(input),before);
 assert.equal(f.sources.length,3);assert.equal(f.demonstrationCount,180);assert.equal(f.sourcePracticeEpisodes,900);assert.equal(f.additionalPracticeEpisodes,300);assert.equal(f.candidates.length,4);
 assert.equal(f.experienceUpdates,f.experienceTransitions*5);assert.ok(f.experienceTransitions>1000);assert.equal(f.sources.reduce((n,s)=>n+s.transitions,0),f.experienceTransitions);
 const withoutQ=structuredClone(input);for(const s of withoutQ.snapshots)s.qTable={};assert.deepEqual(learn(withoutQ).qTable,f.qTable);
 assert.ok(Object.values(input.practiceLibrary).flat().some(r=>!r.success));
 for(const key of Object.keys(input.practiceLibrary)){const v=structuredClone(input);delete v.practiceLibrary[key];assert.throws(()=>learn(v),/实际试错经验/);}
 const changed=inputs([['steady','rush','low'],['rush','early','alternate'],['steady','rush','alternate']]);assert.notDeepEqual(learn(changed).qTable,f.qTable);
});
test('captured practice transitions are full-precision real simulator feedback including terminal failures',()=>{
 for(const runs of Object.values(input.practiceLibrary))for(const run of runs){const state=E.create(run.seed,E.CLASSROOM_PROFILE.disturbance,E.CLASSROOM_PROFILE);for(const t of run.transitions){assert.deepEqual(t.state,{temp:state.temp,maturity:state.maturity,tick:state.tick});const actual=E.step(state,t.action);assert.equal(t.reward,actual.reward);assert.equal(t.done,state.done);assert.deepEqual(t.nextState,{temp:state.temp,maturity:state.maturity,tick:state.tick});}assert.equal(state.done,true);assert.equal(state.success,run.success);assert.equal(state.energy,run.energy);}
});
test('validation alone selects the final checkpoint and independent tests cannot update or select the policy',()=>{
 const f=learn(input),selected=f.candidates.find(c=>c.id===f.selectedCandidateId);assert.deepEqual(selected.validation,f.validation);
 assert.ok(f.candidates.every(c=>!F.better(c.validation,selected.validation)));
 const before=JSON.stringify(f.qTable);assert.deepEqual(E.evaluate(f.qTable,'ai',E.DEFAULT_REWARDS,E.CLASSROOM_PROFILE.disturbance,E.CLASSROOM_PROFILE,F.TEST),f.test);assert.equal(JSON.stringify(f.qTable),before);
 const trainSeeds=[...D.SEEDS,...Array.from({length:300},(_,i)=>D.CONFIG.practiceSeed+67*i),...f.practiceRuns.map(r=>r.seed)];const validation=new Set(f.validationSeeds),testSeeds=new Set(f.testSeeds);
 for(const seed of trainSeeds){assert.equal(validation.has(seed),false);assert.equal(testSeeds.has(seed),false);}for(const seed of validation){assert.equal(testSeeds.has(seed),false);assert.equal(E.CLASSROOM_EVAL_SEEDS.includes(seed),false);}assert.ok([...validation,...testSeeds,...trainSeeds].every(s=>s<9000000));
 assert.equal(f.test.passed+f.test.failed,100);assert.equal(f.test.rate,f.test.passed);assert.ok(f.test.energy>0);
 assert.equal(F.better({passed:90,totalEnergy:2000,steps:8},{passed:89,totalEnergy:100,steps:1}),true);assert.equal(F.better({passed:90,totalEnergy:2000,steps:8},{passed:90,totalEnergy:2000,steps:8}),false);
});
test('all 120 choices of three distinct groups produce reproducible policies from the same inputs',()=>{
 const ids=D.TYPES.map(t=>t.id),sets=[];for(let a=0;a<5;a++)for(let b=a+1;b<5;b++)for(let c=b+1;c<5;c++)sets.push([ids[a],ids[b],ids[c]]);
 const all=inputs(sets);let tested=0;
 for(let a=0;a<10;a++)for(let b=a+1;b<10;b++)for(let c=b+1;c<10;c++){
  const selected=[a,b,c].map(i=>all.snapshots[i]),f=F.learn(selected,all.demonstrationLibrary,all.practiceLibrary),again=F.learn(selected,all.demonstrationLibrary,all.practiceLibrary);
  assert.deepEqual(f.qTable,again.qTable);assert.deepEqual(f.test,again.test);assert.equal(f.sourcePracticeEpisodes,900);assert.ok(f.candidates.every(s=>!F.better(s.validation,f.validation)));tested++;
 }assert.equal(tested,120);
});
test('incomplete or incompatible experience cannot be presented as a combined policy and reports fit the artifact limit',()=>{
 assert.throws(()=>F.learn(input.snapshots.slice(0,2),input.demonstrationLibrary,input.practiceLibrary),/三组/);
 const bad=structuredClone(input);bad.snapshots[1].rewards.energy=2;assert.throws(()=>learn(bad),/反馈标准/);
 const f=learn(input);assert.equal(F.matches(f,input.snapshots),true);assert.equal(F.matches(f,input.snapshots.slice(1)),false);const newer=structuredClone(input.snapshots);newer[0].id=4;assert.equal(F.matches(f,newer),false);
 const small=F.compact(f);assert.equal(small.qTable,undefined);assert.equal(small.practiceRuns,undefined);assert.equal(f.practiceRuns.length,300);assert.ok(Buffer.byteLength(JSON.stringify({...input,finalLearning:f}))<8*1024*1024);
});
