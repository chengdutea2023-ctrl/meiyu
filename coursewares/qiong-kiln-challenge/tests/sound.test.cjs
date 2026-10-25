const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../static/sound.js');
test('local fire samples are audible, bounded and have a smooth loop edge',()=>{
 const a=S.samples(48000),b=S.samples(48000);
 assert.deepEqual(a,b);assert.equal(a.length,192000);
 assert.equal(a[0],0);assert.equal(a.at(-1),0);
 let peak=0,power=0;for(const n of a){peak=Math.max(peak,Math.abs(n));power+=n*n;}
 assert.ok(peak<1);assert.ok(Math.sqrt(power/a.length)>0.02);
});
test('sound follows real heat and stops for pause, training, report and completion',()=>{
 const s={initialized:true,view:'lab',mode:'manual',kiln:{temp:20,done:false},lastAction:0};
 assert.equal(S.level(s),0);s.kiln.temp=80;const hot=S.level(s);assert.ok(hot>0);
 s.lastAction=2;assert.ok(S.level(s)<hot);
 const original=JSON.stringify(s);S.level(s);assert.equal(JSON.stringify(s),original);
 for(const patch of [{view:'report'},{training:true},{locked:true},{initialized:false},{mode:'ai',running:false}])assert.equal(S.level({...s,...patch}),0);
 assert.equal(S.level({...s,kiln:{temp:80,done:true}}),0);
});
