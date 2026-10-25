const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../static/manual.js');
const G=require('../static/guided.js');
const FX=require('../static/effects.js');
const S=require('../static/sound.js');
const frame=(s,seconds)=>{for(let i=0;i<Math.round(seconds*10)&&!s.done;i++)M.advance(s,.1);};
test('a single heating click keeps heating and unattended firing overheats',()=>{
 const s=M.create();M.select(s,0);frame(s,30);
 assert.equal(s.done,true);assert.equal(s.damaged,true);assert.equal(s.success,false);
 assert.ok(Math.abs(s.elapsedSeconds-74/3.6)<.001);assert.equal(s.temp,94);
 assert.ok(s.energy>20);assert.equal(s.controlChanges.length,1);
});
test('timely cooling completes a real-time kiln in about thirty seconds',()=>{
 const s=M.create();assert.equal(s.temp,20);assert.equal(s.action,null);
 M.select(s,0);while(s.maturity<3&&!s.done)M.advance(s,.1);
 assert.equal(s.damaged,false);assert.ok(s.elapsedSeconds>=16&&s.elapsedSeconds<17);
 M.select(s,2);frame(s,30);
 assert.equal(s.done,true);assert.equal(s.success,true);assert.equal(s.reason,'烧成合格');
 assert.ok(s.elapsedSeconds>29&&s.elapsedSeconds<32);assert.equal(s.temp,35);
 assert.equal(s.inRangeSeconds,6);assert.ok(Math.abs(s.energy-s.heatSeconds)<1e-7);
 assert.equal(s.controlChanges.length,2);assert.ok(s.trace.length<=62);
 assert.equal(s.trace.at(-1).elapsedSeconds,Math.round(s.elapsedSeconds*1000)/1000);
 for(let i=1;i<s.trace.length;i++){assert.ok(s.trace[i].elapsedSeconds>s.trace[i-1].elapsedSeconds);assert.ok(s.trace[i].tick>s.trace[i-1].tick);}
 const before=JSON.stringify(s);M.advance(s,.1);assert.equal(M.select(s,0),false);assert.equal(JSON.stringify(s),before);
});
test('cold or prematurely cooled kilns cannot pass, pause and invalid commands cannot advance',()=>{
 const s=M.create(),idle=JSON.stringify(s);M.advance(s,.1);assert.equal(JSON.stringify(s),idle);
 assert.equal(M.select(s,1),false);M.select(s,2);frame(s,65);
 assert.equal(s.done,true);assert.equal(s.elapsedSeconds,60);assert.equal(s.success,false);assert.equal(s.energy,0);
 const p=M.create();M.select(p,0);frame(p,10);M.select(p,2);frame(p,55);assert.equal(p.success,false);
 const v=M.create();M.select(v,0);assert.throws(()=>M.advance(v,1),RangeError);assert.throws(()=>M.advance(v,NaN),RangeError);
});
test('controller uses one timer, repeat clicks do not accelerate, completion records once',()=>{
 let now=100,timer=null,starts=0,completions=0,s=M.create(),allowed=true;
 const c=M.controller({getState:()=>s,canRun:()=>allowed,onUpdate(){},onComplete(){completions++;}},
  {now:()=>now,setInterval:fn=>{starts++;timer=fn;return starts;},clearInterval:()=>{timer=null;}});
 const run=seconds=>{for(let i=0;i<seconds*10&&timer;i++){now+=100;timer();}};
 c.select(0);run(1);const temp=s.temp;c.select(0);c.select(0);
 assert.equal(starts,1);assert.equal(s.controlChanges.length,1);assert.equal(s.temp,temp);
 run(1);assert.ok(Math.abs(s.temp-(20+7.2))<1e-7);
 allowed=false;run(1);assert.equal(s.paused,true);assert.equal(timer,null);const paused=s.elapsedSeconds;
 now+=20000;allowed=true;c.select(0);run(1);assert.ok(Math.abs(s.elapsedSeconds-paused-1)<1e-7);
 now+=2000;timer();assert.equal(s.paused,true);assert.equal(timer,null);
 c.select(0);run(30);assert.equal(completions,1);assert.equal(timer,null);c.select(0);assert.equal(completions,1);
 s=M.create();c.select(0);run(30);assert.equal(completions,2);c.stop();
});
test('real-time hints, smoke and sound follow actual controls without mutating model',()=>{
 const s=M.create(),v={kiln:s,initialized:true,view:'lab',mode:'manual',lastAction:null};
 assert.match(G.hint(s),/点击.*加热/);assert.equal(FX.visual(v).smoke,0);
 M.select(s,0);v.lastAction=0;frame(s,14);const hot=FX.visual(v);assert.ok(hot.smoke>.1);
 assert.match(G.hint(s),/累计/);assert.ok(S.level(v)>0);
 s.paused=true;assert.equal(FX.visual(v).paused,true);assert.equal(S.level(v),0);assert.match(G.hint(s),/暂停/);
 M.select(s,2);v.lastAction=2;assert.ok(FX.visual(v).smoke<hot.smoke);
 const before=JSON.stringify(s);FX.visual(v);S.level(v);G.hint(s);assert.equal(JSON.stringify(s),before);
 const summary=G.summary({records:[{...s,mode:'manual',result:'烧成合格',simulatedDurationSeconds:30.5,steps:1}],snapshots:[]});
 assert.match(summary,/实时30.5秒，切换1次/);
});
