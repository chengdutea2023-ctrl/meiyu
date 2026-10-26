const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../static/engine.js');

test('manual path succeeds, records all actions and is reproducible', () => {
  const run = () => { const s = E.create(21); for (const a of [0,0,0,1,1,2,2,2]) E.step(s, a); return s; };
  const a = run(), b = run();
  assert.equal(a.success, true); assert.equal(a.energy, 19); assert.equal(a.tick, 8);
  assert.deepEqual(a.trace, b.trace); assert.equal(a.trace.length, 9);
  E.step(a, 0); assert.equal(a.trace.length, 9);
});
test('overheating and underfiring are recorded as real failures', () => {
  const damaged = E.create(21); while (!damaged.done) E.step(damaged, 0);
  assert.equal(damaged.damaged, true); assert.equal(damaged.success, false);
  const cold = E.create(21); while (!cold.done) E.step(cold, 2);
  assert.equal(cold.tick, 22); assert.equal(cold.reason, '烧成不足'); assert.equal(cold.success, false);
});
test('Q-learning updates values from experience, improves on the paired unseen test seeds', () => {
  const q = {}, before = E.evaluate(q, 'ai');
  for (let i = 0; i < 3000; i++) E.episode(q, i, E.DEFAULT_REWARDS);
  const after = E.evaluate(q, 'ai');
  assert.ok(Object.keys(q).length > 100);
  assert.ok(Object.values(q).some(row => row.some(v => v !== 0)));
  assert.ok(after.rate > before.rate);
  assert.deepEqual(after, E.evaluate(q, 'ai'));
  const snapshot = JSON.stringify(q); E.evaluate(q, 'ai'); assert.equal(JSON.stringify(q), snapshot);
});
test('changed rewards really change learned policy; success is not forced', () => {
  const q = {}, rewards = { success:100, damage:80, energy:5, time:1 };
  for (let i = 0; i < 3000; i++) E.episode(q, i, rewards);
  const learned = E.evaluate(q, 'ai', rewards);
  assert.equal(learned.rate, 0); assert.equal(learned.energy, 0);
  assert.equal(E.evaluate({}, 'fixed').rate, 100);
});
test('balanced energy preset learns a real firing policy using less energy on paired tests', () => {
 const run=energy=>{const q={},rewards={...E.DEFAULT_REWARDS,energy};for(let i=0;i<3000;i++)E.episode(q,i,rewards);return {q,rewards,result:E.evaluate(q,'ai',rewards)};};
 const quality=run(1),energy=run(2);
 assert.ok(energy.result.rate>=90);assert.ok(energy.result.energy>0);assert.ok(energy.result.energy<quality.result.energy);
 assert.notDeepEqual(quality.q,energy.q);assert.deepEqual(energy.result,E.evaluate(energy.q,'ai',energy.rewards));
 const fs=require('node:fs'),app=fs.readFileSync(require.resolve('../static/app.js'),'utf8');
 assert.match(app,/state.modelRewards = \{ \.\.\.E.DEFAULT_REWARDS \}/);
 assert.doesNotMatch(app,/function preset\(/);
});
