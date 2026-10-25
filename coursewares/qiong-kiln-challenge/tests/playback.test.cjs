const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../static/engine.js'),A=require('../static/playback.js');
function fixture(actions){
 let now=0,timer=null,starts=0,allowed=true;const steps=[],statuses=[];
 const p=A.player({onStep:a=>steps.push({action:a,at:now}),onUpdate:s=>statuses.push(s),canRun:()=>allowed},
  {now:()=>now,setInterval:fn=>{starts++;timer=fn;return starts;},clearInterval:()=>{timer=null;}});
 p.reset(actions);
 return{p,steps,statuses,get starts(){return starts;},get timer(){return timer;},allow:v=>{allowed=v;},gap:ms=>{now+=ms;timer?.();},advance:ms=>{for(let i=0;i<ms/100;i++){now+=100;timer?.();}}};
}
test('different action counts each finish at thirty active seconds, not thirty seconds per training sample',()=>{
 for(const count of [1,7,9,22]){
  const f=fixture(Array.from({length:count},(_,i)=>i%3));assert.equal(f.p.run(),true);f.advance(29900);assert.equal(f.p.status().finished,false);
  f.advance(100);assert.equal(f.p.status().finished,true);assert.equal(f.p.status().elapsedMs,30000);assert.equal(f.steps.length,count);assert.equal(f.timer,null);assert.equal(f.p.run(),false);
 }
});
test('pause resumes the same next action and repeated clicks cannot add a second timer',()=>{
 const f=fixture([0,0,1,2,2,2,2]);f.p.run();assert.equal(f.p.run(),false);assert.equal(f.starts,1);f.advance(10000);f.p.pause();const paused=f.p.status();
 f.advance(5000);assert.deepEqual(f.p.status(),paused);f.p.run();f.advance(20000);assert.equal(f.p.status().finished,true);assert.equal(f.steps.at(-1).at,35000);assert.deepEqual(f.steps.map(s=>s.action),[0,0,1,2,2,2,2]);
});
test('hidden or stalled playback pauses without catching up or inventing action records; reset discards old timer',()=>{
 const f=fixture([0,0,1,2,2,2,2]);f.p.run();f.advance(1000);f.allow(false);f.advance(100);assert.equal(f.p.status().running,false);assert.equal(f.steps.length,1);
 f.advance(9000);f.allow(true);f.p.run();f.gap(3000);assert.equal(f.p.status().running,false);assert.equal(f.p.status().elapsedMs,1000);
 f.p.run();f.p.reset([2,2]);f.advance(1000);assert.equal(f.p.status().index,0);assert.equal(f.p.status().elapsedMs,0);assert.equal(f.timer,null);
 assert.throws(()=>f.p.reset([3]));assert.throws(()=>f.p.reset(Array(23).fill(0)));
});
test('paced sequence reproduces the real learned trace exactly without mutating Q or evaluation',()=>{
 for(const energy of [1,2,5]){
  const rewards={...E.DEFAULT_REWARDS,energy},q={};for(let i=0;i<3000;i++)E.episode(q,i,rewards);
  const before=JSON.stringify(q),evaluation=E.evaluate(q,'ai',rewards),actions=A.sequence(E,q,21,rewards),s=E.create(21),rng=E.random(30),expected=E.create(21);
  for(const a of actions)E.step(s,a,rewards);while(!expected.done)E.step(expected,E.choose(q,expected,rng),rewards);
  assert.deepEqual(s.trace,expected.trace);assert.equal(s.reason,expected.reason);assert.equal(JSON.stringify(q),before);assert.deepEqual(E.evaluate(q,'ai',rewards),evaluation);
 }
});
