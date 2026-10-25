const {test} = require('node:test');
const assert = require('node:assert/strict');
const E = require('../static/engine.js');
const FX = require('../static/effects.js');
const state = overrides => ({kiln:E.create(21), initialized:true, view:'lab', mode:'manual', lastAction:null, ...overrides});
test('cold kiln and all-cooling policy never invent fire', () => {
  const s=state(); assert.equal(FX.visual(s).fire,0);
  for(let i=0;i<22&&!s.kiln.done;i++){E.step(s.kiln,2);s.lastAction=2;assert.equal(FX.visual(s).fire,0);}
  assert.equal(FX.visual(s).phase,'ended');
});
test('animation derives only from actual actions and does not mutate simulation', () => {
  const s=state(); E.step(s.kiln,0);s.lastAction=0;
  const before=JSON.stringify(s),rng=s.kiln.rng,v=FX.visual(s);
  assert.ok(v.fire>0);assert.equal(v.phase,'heating');assert.equal(JSON.stringify(s),before);assert.equal(s.kiln.rng,rng);
  E.step(s.kiln,1);s.lastAction=1;assert.equal(FX.visual(s).phase,'holding');
  E.step(s.kiln,2);s.lastAction=2;assert.equal(FX.visual(s).phase,'cooling');
  s.training=true;assert.equal(FX.visual(s).active,false);assert.equal(FX.visual(s).fire,0);
});
test('success, overheat and insufficient firing remain distinct', () => {
  const s=state();
  while(!s.kiln.done) E.step(s.kiln,E.fixed(s.kiln));
  assert.equal(s.kiln.success,true);assert.equal(FX.visual(s).phase,'success');assert.equal(FX.visual(s).fire,0);
  s.kiln=E.create(21);while(!s.kiln.done)E.step(s.kiln,0);
  assert.equal(FX.visual(s).phase,'damaged');
  s.view='report';assert.equal(FX.visual(s).active,false);
  s.mode='ai';s.running=false;s.kiln=E.create(21);assert.equal(FX.visual(s).paused,true);
});
test('overlay cover transform aligns at all tested aspect ratios', () => {
  for(const [w,h] of [[1672,941],[1440,900],[1024,768],[768,720],[390,700]]){
    const f=FX.frame(w,h);
    assert.ok(f.scale*1672>=w-0.001);assert.ok(f.scale*941>=h-0.001);
    assert.ok(Math.abs(f.x*2+1672*f.scale-w)<0.001);
    assert.ok(Math.abs(f.y*2+941*f.scale-h)<0.001);
  }
  assert.equal(FX.FPS,30);assert.equal(FX.MAX_DPR,1.5);
});
