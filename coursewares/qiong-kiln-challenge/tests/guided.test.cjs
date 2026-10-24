const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../static/engine.js');
const G = require('../static/guided.js');
test('workshop skin references shipped assets, including cache-busted images and control sprites', () => {
 const fs = require('node:fs'), path = require('node:path');
 const root = path.resolve(__dirname, '../static');
 const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
 for (const match of html.matchAll(/(?:src|href)="\.\/([^"?]+)(?:\?[^\"]*)?"/g)) {
  assert.equal(fs.existsSync(path.join(root, match[1])), true, match[1]);
 }
 const css = fs.readFileSync(path.join(root, 'workshop.css'), 'utf8');
 for (const match of css.matchAll(/url\('\.\/([^']+)'\)/g)) assert.equal(fs.existsSync(path.join(root, match[1])), true);
 const sprite = fs.readFileSync(path.join(root, 'assets/kiln-controls.png'));
 assert.equal(sprite.subarray(1, 4).toString(), 'PNG');
 assert.equal(sprite.readUInt32BE(16), sprite.readUInt32BE(20) * 3);
});
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
