const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../static/engine.js'),A=require('../static/playback.js'),G=require('../static/guided.js'),Q=require('../static/quiz.js'),P=E.CLASSROOM_PROFILE;
const train=energy=>{const q={},rewards={...E.DEFAULT_REWARDS,energy};for(let i=0;i<3000;i++)E.episode(q,i,rewards,815,P.disturbance,3000,P);return{q,rewards,result:E.evaluate(q,'ai',rewards,P.disturbance,P)};};
const quality=train(1),energy=train(2);
test('new paired cohort is fixed, shared, disjoint from training and records every outcome',()=>{
 assert.equal(E.CLASSROOM_EVAL_SEEDS.length,100);assert.equal(new Set(E.CLASSROOM_EVAL_SEEDS).size,100);assert.deepEqual(E.CLASSROOM_EVAL_SEEDS.slice(0,30),E.EVAL_SEEDS);
 const trainingSeeds=new Set(Array.from({length:8000},(_,i)=>815+i*67));assert.ok(E.CLASSROOM_EVAL_SEEDS.every(seed=>!trainingSeeds.has(seed)));
 for(const s of [quality,energy]){const r=s.result;assert.equal(r.samples,100);assert.equal(r.passed+r.failed,r.samples);assert.equal(r.rate,r.passed);assert.equal(r.environmentId,P.id);assert.equal(r.cohortId,'paired-100-v1');assert.equal(Object.values(r.failureReasons).reduce((a,b)=>a+b,0),r.failed);assert.equal(r.energy,+(r.totalEnergy/r.samples).toFixed(1));assert.equal(r.energyPerQualified,+(r.totalEnergy/r.passed).toFixed(1));}
});
test('conditions and progress draws depend on seed and time, not selected reward preference',()=>{
 const a=E.create(21,P.disturbance,P),b=E.create(21,P.disturbance,P);assert.deepEqual(a.conditions,b.conditions);
 for(const action of [0,0,0,1,1,1,2,2]){E.step(a,action,quality.rewards);E.step(b,action,energy.rewards);}
 assert.deepEqual(a.trace.map(({reward,...p})=>p),b.trace.map(({reward,...p})=>p));assert.notEqual(a.totalReward,b.totalReward);
 const c=E.create(21,P.disturbance,P),d=E.create(21,P.disturbance,P);E.step(c,0);E.step(d,2);assert.equal(c.trace[1].weather,d.trace[1].weather);assert.equal(c.trace[1].progressDraw,d.trace[1].progressDraw);
});
test('being in the firing band is not a guaranteed progress tick in the variable model',()=>{
 const gains=new Set();for(let seed=1;seed<100;seed++){const s=E.create(seed,P.disturbance,P);s.temp=70;E.step(s,1);if(s.temp>=58&&s.temp<=80)gains.add(s.trace[1].progressGain);}
 assert.ok(gains.has(0));assert.ok(gains.has(1));assert.equal(E.create(21).profile,null);
});
test('different policies give measured tradeoffs without changing Q during evaluation',()=>{
 const before=JSON.stringify(energy.q);assert.deepEqual(energy.result,E.evaluate(energy.q,'ai',energy.rewards,P.disturbance,P));assert.equal(JSON.stringify(energy.q),before);
 assert.ok(quality.result.rate>energy.result.rate);assert.ok(energy.result.energy<quality.result.energy);assert.ok(energy.result.energy>0);assert.ok(energy.result.energyPerQualified>quality.result.energyPerQualified);
 const snapshots=[quality,energy].map(s=>({episodes:3000,rewards:s.rewards,after:s.result})),text=G.comparisonInsight(snapshots);
 assert.match(text,/合格率下降5个百分点/);assert.match(text,/每件合格品能耗28.3 → 28.7/);
 const fs=require('node:fs'),ui=fs.readFileSync(require.resolve('../static/guided.js'),'utf8');assert.doesNotMatch(ui,/95%|28\.3|27\.3|28\.7/);
});
test('separate additional 300 seeds validate generalization rather than cherry-picking displayed cases',()=>{
 const extra=s=>{let wins=0,spent=0;for(let i=0;i<300;i++){const seed=1900001+i*53,k=E.create(seed,P.disturbance,P),rng=E.random(seed+9);while(!k.done)E.step(k,E.choose(s.q,k,rng),s.rewards);wins+=+k.success;spent+=k.energy;}return{wins,spent};};
 const a=extra(quality),b=extra(energy);assert.ok(a.wins>b.wins);assert.ok(b.spent<a.spent);assert.ok(b.wins>250);
});
test('30-second action sequence replays new profile exactly; historical engine remains unchanged',()=>{
 for(const model of [quality,energy]){const actions=A.sequence(E,model.q,21,model.rewards,'ai',P),s=E.create(21,P.disturbance,P),r=E.create(21,P.disturbance,P),rng=E.random(30);for(const a of actions)E.step(s,a,model.rewards);while(!r.done)E.step(r,E.choose(model.q,r,rng),model.rewards);assert.deepEqual(s.trace,r.trace);}
 const legacyQ={};for(let i=0;i<3000;i++)E.episode(legacyQ,i,E.DEFAULT_REWARDS);const old=E.evaluate(legacyQ,'ai');assert.equal(old.samples,30);assert.equal(old.rate,100);assert.equal(old.energy,22.1);
});
test('comparison rejects different environments and learning evidence describes actual decisions',()=>{
 const a={episodes:3000,rewards:quality.rewards,after:quality.result},b={episodes:3000,rewards:energy.rewards,after:{...energy.result,cohortId:'different'}};assert.match(G.comparisonInsight([a,b]),/不能直接比较/);
 const state={training:false,trained:true,rewards:quality.rewards,modelRewards:quality.rewards,lastDecision:{temperatureCelsius:1015,maturity:1,action:'保持',progressGain:0,reward:-3}};
 assert.match(G.decisionEvidence(state),/1015℃.*选择保持.*进度\+0.*奖励-3/);assert.match(G.decisionEvidence({...state,training:true,iterations:50}),/已试错50次/);assert.doesNotMatch(G.decisionEvidence({...state,rewards:energy.rewards}),/1015/);
 assert.doesNotMatch(G.heatStage({temp:60,maturity:0,profile:P},'ai').meaning,/累计3步/);const question=Q.questions.find(q=>q.id==='energy-comparison-v2');assert.ok(question);assert.equal(question.correct,'paired-results');assert.doesNotMatch(question.title,/均为100%/);
});
