const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../static/engine.js'),D=require('../static/demonstrations.js'),A=require('../static/playback.js'),G=require('../static/guided.js');
const ids=D.TYPES.map(t=>t.id),combinations=[];
for(let a=0;a<3;a++)for(let b=a+1;b<4;b++)for(let c=b+1;c<5;c++)combinations.push([ids[a],ids[b],ids[c]]);
const results=combinations.map(selectedTypes=>{
 const prepared=D.prepare(selectedTypes),qBeforePractice=JSON.stringify(prepared.q);
 for(let i=0;i<D.CONFIG.practiceEpisodes;i++)D.practice(prepared.q,i);
 return {selectedTypes,combinationId:D.combinationId(selectedTypes),demonstrationVersion:D.VERSION,demonstrationCount:60,episodes:300,stopped:false,
  before:prepared.before,afterDemonstrations:prepared.afterDemonstrations,after:D.evaluate(prepared.q),q:prepared.q,demonstrations:prepared.demonstrations,qBeforePractice};
});
test('five choose three validates identity and is independent of click order',()=>{
 assert.equal(combinations.length,10);assert.equal(new Set(combinations.map(D.combinationId)).size,10);
 for(const set of combinations)assert.equal(D.combinationId(set),D.combinationId([...set].reverse()));
 for(const invalid of [[],ids.slice(0,2),ids.slice(0,4),[ids[0],ids[0],ids[2]],['unknown',ids[1],ids[2]],null]){assert.equal(D.selection(invalid),null);assert.equal(D.combinationId(invalid),'');assert.throws(()=>D.prepare(invalid));}
});
test('second and third rounds require a new valid combination, not a reordered earlier set',()=>{
 const first=['steady','rush','low'],second=['rush','early','alternate'],third=['steady','low','early'];
 assert.equal(D.REQUIRED_COMBINATIONS,3);
 for(const completed of [[first],[first,second]]){
  for(const previous of completed){assert.equal(D.nextSelection(previous,completed),null);assert.equal(D.nextSelection([...previous].reverse(),completed),null);}
  for(const invalid of [[],['steady','rush'],['steady','rush','low','early'],['steady','steady','early'],['steady','rush','unknown']])assert.equal(D.nextSelection(invalid,completed),null);
 }
 assert.equal(D.nextSelection(second,[]),null);assert.equal(D.nextSelection(third,[[]]),null);
 assert.deepEqual(D.nextSelection([...second].reverse(),[first]),second);
 assert.deepEqual(D.nextSelection([...third].reverse(),[first,second]),third);
 assert.equal(D.nextSelection(['steady','rush','early'],[first,second,third]),null);
 const completed=[first,second],snapshot=JSON.stringify(completed);D.nextSelection(third,completed);assert.equal(JSON.stringify(completed),snapshot);
});
test('demonstrations, practice and held-out tests have disjoint seeds and equal conditions per type',()=>{
 const practice=new Set(Array.from({length:300},(_,i)=>815+i*67));
 assert.equal(D.SEEDS.length,20);for(const seed of D.SEEDS){assert.ok(!practice.has(seed));assert.ok(!E.CLASSROOM_EVAL_SEEDS.includes(seed));}
 const runs=D.examples(ids.slice(0,3));assert.equal(runs.length,60);
 for(const id of ids.slice(0,3)){const own=runs.filter(r=>r.strategyId===id);assert.deepEqual(own.map(r=>r.seed),[...D.SEEDS]);assert.equal(own.length,20);}
 for(let i=0;i<20;i++)assert.deepEqual(runs[i].conditions,runs[i+20].conditions);
});
test('every recorded demonstration is real simulator feedback, including terminal failures',()=>{
 for(const id of ids){const r=D.example(id,D.SEEDS[0]),s=E.create(r.seed,E.CLASSROOM_PROFILE.disturbance,E.CLASSROOM_PROFILE);
  assert.equal(r.source,'scripted-teaching-demonstration');for(const t of r.transitions){assert.equal(t.action,D.action(id,s));assert.deepEqual(t.state,{temp:s.temp,maturity:s.maturity,tick:s.tick});const v=E.step(s,t.action);assert.equal(t.reward,v.reward);assert.equal(t.done,v.done);assert.deepEqual(t.nextState,{temp:s.temp,maturity:s.maturity,tick:s.tick});}assert.deepEqual(r.trace,s.trace);assert.equal(r.success,s.success);assert.equal(r.result,s.reason);assert.equal(r.energy,s.energy);
 }
 assert.equal(D.example('rush',D.SEEDS[0]).success,false);assert.equal(D.example('alternate',D.SEEDS[0]).success,false);
});
test('all ten combinations learn from their actual demonstrations and practice reproducibly',()=>{
 assert.equal(results.length,10);for(const r of results){assert.ok(Object.keys(JSON.parse(r.qBeforePractice)).length>0);assert.notEqual(r.qBeforePractice,JSON.stringify(r.q));
  const again=D.prepare([...r.selectedTypes].reverse());assert.equal(JSON.stringify(again.q),r.qBeforePractice);assert.deepEqual(again.afterDemonstrations,r.afterDemonstrations);for(let i=0;i<300;i++)D.practice(again.q,i);assert.deepEqual(again.q,r.q);assert.deepEqual(D.evaluate(again.q),r.after);
  const snapshot=JSON.stringify(r.q);D.evaluate(r.q);assert.equal(JSON.stringify(r.q),snapshot);assert.equal(r.after.passed+r.after.failed,100);assert.equal(r.after.energy,+(r.after.totalEnergy/100).toFixed(1));assert.ok(D.complete(r));
 }
 assert.ok(new Set(results.map(r=>r.qBeforePractice)).size>1);assert.ok(new Set(results.map(r=>r.afterDemonstrations.rate)).size>1);
});
test('repeated combinations, stopped training and changed selections cannot bypass completion',()=>{
 const a=results[0],b=results[1],history=[a,a,{...b,episodes:299},{...b,stopped:true}],before=JSON.stringify(history);
 assert.equal(D.latestTrials(history).length,1);assert.equal(D.latestTrials([...history,b]).length,2);assert.equal(JSON.stringify(history),before);
 assert.equal(D.latestTrials([...history,b,a,b]).length,2);
 assert.equal(D.latestTrials([...history,b,results[2]]).length,D.REQUIRED_COMBINATIONS);
 assert.equal(D.modelMatches({trained:true,selectedTypes:[...a.selectedTypes].reverse(),modelCombinationId:a.combinationId}),true);
 assert.equal(D.modelMatches({trained:true,selectedTypes:b.selectedTypes,modelCombinationId:a.combinationId}),false);
 assert.equal(D.modelMatches({trained:false,selectedTypes:a.selectedTypes,modelCombinationId:a.combinationId}),false);
 assert.equal(D.complete({...a,combinationId:b.combinationId}),false);
});
test('final observation reminder needs three distinct complete learnings and does not interrupt a paused replay',()=>{
 const [a,b,c]=results,state={mode:'ai',phase:'learning',view:'lab',initialized:true,training:false,running:false,locked:false,snapshots:[a,b,c],playback:{index:10,finished:true}};
 assert.equal(D.observationReady(state),true);
 for(const snapshots of [[],[a,a,a],[a,b,a],[a,b,{...c,episodes:299}]])assert.equal(D.observationReady({...state,snapshots}),false);
 for(const change of [{training:true},{running:true},{locked:true},{initialized:false},{mode:'manual'},{phase:'final'},{view:'report'},{playback:{index:5,finished:false}}])assert.equal(D.observationReady({...state,...change}),false);
});
test('trained AI playback uses its own Q values, not a scripted demonstration',()=>{
 for(const r of results){const expected=E.create(21,E.CLASSROOM_PROFILE.disturbance,E.CLASSROOM_PROFILE),rng=E.random(30);
  const sequence=A.sequence(E,r.q,21,E.DEFAULT_REWARDS,'ai',E.CLASSROOM_PROFILE),actual=E.create(21,E.CLASSROOM_PROFILE.disturbance,E.CLASSROOM_PROFILE);
  while(!expected.done)E.step(expected,E.choose(r.q,expected,rng));for(const a of sequence)E.step(actual,a);assert.deepEqual(actual.trace,expected.trace);
 }
});
test('guide summary keeps combinations distinct and truthful even when results match',()=>{
 const [a,b]=results;const snapshots=[a,a,b],before=JSON.stringify(snapshots),summary=G.summary({records:[],snapshots});
 assert.match(summary,/组合1/);assert.match(summary,/组合2/);assert.match(summary,/参考示范后.*自主练习后/);assert.doesNotMatch(summary,/优先烧好|优先节能/);
 assert.match(D.insight([a,{...b,after:{...a.after}}]),/表现相同/);assert.equal(JSON.stringify(snapshots),before);
 const c=results[2],three=[a,b,c];assert.match(D.insight(snapshots),/第三套/);
 const threeSummary=G.summary({records:[],snapshots:three});assert.match(threeSummary,/组合3/);
 const insight=D.insight(three);assert.match(insight,/最近三套/);assert.doesNotMatch(insight,/还需/);
 assert.ok(insight.includes(three.map(s=>s.after.rate+'%').join(' → ')));
 assert.equal(D.latestTrials([a,b,{...c,after:{...c.after,cohortId:'unpaired'}}]).length,2);
});
