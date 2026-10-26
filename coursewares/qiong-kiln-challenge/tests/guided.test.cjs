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
test('visible heat legend matches all four temperature boundaries without confusing manual seconds and AI steps',()=>{
 const s={temp:20,maturity:0},before=JSON.stringify(s);assert.equal(G.heatStage(s).key,'cold');assert.equal(JSON.stringify(s),before);
 for(const[temp,key]of [[57.9,'cold'],[58,'firing'],[80,'firing'],[80.1,'warning'],[93.9,'warning'],[94,'danger'],[100,'danger']])assert.equal(G.heatStage({...s,temp}).key,key);
 assert.match(G.heatStage({...s,temp:60}).meaning,/6秒/);assert.match(G.heatStage({...s,temp:60},'ai').meaning,/3步/);
 assert.match(G.heatStage({...s,temp:94}).meaning,/2秒.*炸膛/);assert.doesNotMatch(G.heatStage({...s,temp:94},'ai').meaning,/2秒/);
 assert.match(G.heatStage({...s,maturity:3}).meaning,/冷却阶段/);assert.match(G.heatStage({...s,maturity:3,success:true}).meaning,/冷却完成/);
 const fs=require('node:fs'),source=fs.readFileSync(require.resolve('../static/guided.js'),'utf8');assert.match(source,/id='heatLegend'/);assert.match(source,/aria-describedby','heatMeaning/);
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
 assert.equal(G.rewardProgress([trial(2),trial(3)]).count,1);
 assert.deepEqual(G.rewardProgress([trial(1),trial(2)]),{quality:true,energy:true,count:2});
 assert.equal(G.rewardKind({success:200,damage:80,energy:5,time:1}),'custom');
});
test('comparison keeps only the newest result per preference without mutating full history', () => {
 const trial=(energy,cost,rate=100)=>({rewards:{success:100,damage:80,energy,time:1},episodes:3000,after:{samples:30,rate,energy:cost,steps:8}});
 const snapshots=[trial(1,22.1),trial(1,23),trial(5,0,0),trial(2,19)],before=JSON.stringify(snapshots);
 const latest=G.latestTrials(snapshots);
 assert.equal(latest.length,2);assert.equal(latest[0].after.energy,23);assert.equal(latest[1].after.energy,19);
 assert.equal(JSON.stringify(snapshots),before);assert.match(G.comparisonInsight(snapshots),/能耗降低/);
 const summary=G.summary({records:[],snapshots});assert.equal((summary.match(/优先烧好/g)||[]).length,1);assert.equal((summary.match(/优先节能/g)||[]).length,1);assert.doesNotMatch(summary,/合格率0%/);
 const same=[trial(1,19),trial(2,19)];assert.match(G.comparisonInsight(same),/表现相同/);
 const failed=[trial(1,22.1),trial(5,0,0)];assert.match(G.summary({records:[],snapshots:failed}),/合格率0%/);
});
test('new automatic summary excludes the removed program stage and labels custom rewards accurately', () => {
 const text=G.summary({records:[{mode:'manual',result:'烧成合格',energy:19,steps:8},{mode:'fixed',result:'烧成合格',energy:21,steps:9}],snapshots:[{rewards:{success:200,damage:80,energy:5,time:1},after:{samples:30,rate:0,energy:0,steps:22}}]});
 assert.match(text,/我来烧/);assert.match(text,/自定义奖励/);assert.doesNotMatch(text,/程序烧|固定程序|优先节能/);
});
test('five-question report retains legacy first-question fields and uses the new scoring contract', () => {
 const fs=require('node:fs'),html=fs.readFileSync(require.resolve('../static/index.html'),'utf8'),app=fs.readFileSync(require.resolve('../static/app.js'),'utf8');
 const Q=require('../static/quiz.js');assert.equal(Q.questions.length,5);
 assert.match(Q.questions[0].title,/为什么换一组示范/);assert.equal(Q.questions[0].name,'concept');assert.equal(Q.questions[0].correct,'learned');
 assert.match(html,/id="quizQuestions"/);assert.match(html,/quiz\.js/);
 assert.match(app,/conceptQuestionId: Q.questions\[0\]\?\.id/);
 assert.match(app,/conceptAnswerText:/);assert.match(app,/score: quiz.total/);assert.doesNotMatch(app,/score: conceptCorrect \? 100 : 80/);
});
