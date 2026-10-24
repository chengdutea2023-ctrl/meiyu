const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../static/engine.js');
const G = require('../static/guided.js');
test('guided hints follow actual heat and maturity, including failure and success', () => {
  const s = E.create(); assert.match(G.hint(s), /加热/);
  Object.assign(s,{temp:70,maturity:1});assert.match(G.hint(s),/保持/);
  s.temp=85;assert.match(G.hint(s),/降温/);
  s.maturity=3;s.temp=50;assert.match(G.hint(s),/降温/);
  s.done=true;s.success=false;assert.match(G.hint(s),/没有成功/);
  s.success=true;assert.match(G.hint(s),/烧好了/);
});
test('following the displayed guidance can finish the real simulation', () => {
 for(let seed=1;seed<=30;seed++) {const s=E.create(seed);while(!s.done){const h=G.hint(s);E.step(s,h.includes('加热')?0:h.includes('保持')?1:2);}assert.equal(s.success,true);}
});
test('automatic summary uses observed data and preserves unsuccessful energy policies', () => {
 const text=G.summary({records:[{mode:'manual',result:'过热损坏',energy:25,steps:5}],snapshots:[{rewards:{energy:5},after:{samples:30,rate:0,energy:0,steps:22}}]});
 assert.match(text,/过热损坏/);assert.match(text,/合格率0%/);assert.match(text,/平均能耗0/);assert.equal(G.summary({records:[],snapshots:[]}), '');
});
