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
 const text=G.summary({records:[{mode:'manual',result:'过热损坏',energy:25,steps:5}],snapshots:[{rewards:{success:100,damage:80,energy:5,time:1},after:{samples:30,rate:0,energy:0,steps:22}}]});
 assert.match(text,/过热损坏/);assert.match(text,/合格率0%/);assert.match(text,/平均能耗0/);assert.equal(G.summary({records:[],snapshots:[]}), '');
});
test('two-stage progress counts the required presets once, including unsuccessful experiments', () => {
 const trial=(energy,extra={})=>({rewards:{success:100,damage:80,energy,time:1},episodes:3000,after:{samples:30,rate:0},...extra});
 assert.deepEqual(G.rewardProgress([]),{quality:false,energy:false,count:0});
 assert.deepEqual(G.rewardProgress([trial(1),trial(1)]),{quality:true,energy:false,count:1});
 assert.deepEqual(G.rewardProgress([trial(1),trial(5)]),{quality:true,energy:true,count:2});
 assert.equal(G.rewardProgress([trial(1,{episodes:0}),trial(5,{after:{samples:0}})]).count,0);
 assert.equal(G.rewardProgress([trial(2),trial(3)]).count,0);
 assert.equal(G.rewardKind({success:200,damage:80,energy:5,time:1}),'custom');
});
test('new automatic summary excludes the removed program stage and labels custom rewards accurately', () => {
 const text=G.summary({records:[{mode:'manual',result:'烧成合格',energy:19,steps:8},{mode:'fixed',result:'烧成合格',energy:21,steps:9}],snapshots:[{rewards:{success:200,damage:80,energy:5,time:1},after:{samples:30,rate:0,energy:0,steps:22}}]});
 assert.match(text,/我来烧/);assert.match(text,/自定义奖励/);assert.doesNotMatch(text,/程序烧|固定程序|优先节能/);
});
test('final question focuses on reward experiments and reports retain the question and chosen answer', () => {
 const fs=require('node:fs'),html=fs.readFileSync(require.resolve('../static/index.html'),'utf8'),app=fs.readFileSync(require.resolve('../static/app.js'),'utf8');
 const quiz=html.match(/<fieldset class="quiz">([\s\S]*?)<\/fieldset>/)[1];
 assert.match(quiz,/为什么改变奖励后，AI可能改变烧窑方式/);
 assert.match(quiz,/value="learned">奖励重点变了，AI通过试错学到的操作选择也可能改变/);
 assert.doesNotMatch(quiz,/由谁决定|程序员提前写好|最佳配方/);
 assert.equal([...quiz.matchAll(/name="concept"/g)].length,3);
 assert.match(app,/conceptQuestionId: 'reward-effects-v1'/);
 assert.match(app,/conceptAnswerText:/);assert.match(app,/score: conceptCorrect \? 100 : 80/);
});
