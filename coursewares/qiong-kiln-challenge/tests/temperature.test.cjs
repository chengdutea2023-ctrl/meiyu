const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../static/temperature.js');
const E = require('../static/engine.js');
test('Celsius display preserves all teaching thresholds and has a monotone bounded scale', () => {
  for (const [index, expected] of [[0,0],[20,20],[35,60],[58,1000],[80,1200],[94,1350],[100,1400]]) assert.equal(T.celsius(index), expected);
  let previous = -1;
  for (let i = 0; i <= 1000; i++) { const current = T.celsius(i / 10); assert.ok(current >= previous); previous = current; }
  assert.equal(T.celsius(-10),0); assert.equal(T.celsius(110),1400); assert.throws(()=>T.celsius(NaN)); assert.throws(()=>T.celsius(Infinity));
  assert.equal(T.format(58),'1000℃'); assert.equal(T.metadata.internalUnit,'heat-index-0-100'); assert.equal(T.metadata.displayUnit,'celsius');
});
test('display conversion never modifies simulation state, traces or learned decisions', () => {
  const s = E.create(21), before = JSON.stringify(s);
  T.format(s.temp); assert.equal(JSON.stringify(s),before);
  while (!s.done) { T.celsius(s.temp); E.step(s,E.fixed(s)); }
  assert.equal(s.success,true); assert.ok(s.temp<=35); assert.ok(T.celsius(s.temp)<=60);
});
