import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {QUIZ, quizComplete, quizResults, answeredQuizCount} from '../src/quiz.js';
import {ORIGINAL,grade,canSubmitWork,reportText} from '../src/engine.js';
const answers=Object.fromEntries(QUIZ.map(q=>[q.id,q.correct]));
const records=[{specimenId:'a',name:'壶',phase:'原图',params:{...ORIGINAL},values:[.1,.1,.8]},{specimenId:'a',name:'壶',phase:'变化后',params:{...ORIGINAL,angle:90},values:[.8,.1,.1]}];
const work={records,observation:'旋转图片后，AI 的名称变了，需要再核对可见特征。',answers,sources:[]};
test('five ten-point questions cover AI observation, controlled comparison and source-based knowledge',()=>{
 assert.equal(QUIZ.length,5);assert.equal(new Set(QUIZ.map(q=>q.id)).size,5);assert.ok(QUIZ.every(q=>q.options.length===3&&q.options.some(([v])=>v===q.correct)));
 assert.equal(answeredQuizCount(answers),5);assert.equal(quizComplete(answers),true);
 assert.deepEqual(grade(work),{score:100,evidence:30,explanation:20,concepts:50});
 for(const q of QUIZ){const wrong=q.options.find(([v])=>v!==q.correct)[0];assert.equal(grade({...work,answers:{...answers,[q.id]:wrong}}).score,90);}
 const wrong=Object.fromEntries(QUIZ.map(q=>[q.id,q.options.find(([v])=>v!==q.correct)[0]]));assert.equal(grade({...work,answers:wrong}).score,50);
});
test('incomplete, unknown and legacy answers cannot bypass five-question completion',()=>{
 assert.equal(canSubmitWork(work),true);
 for(const q of QUIZ){const a={...answers};delete a[q.id];assert.equal(canSubmitWork({...work,answers:a}),false);a[q.id]='invalid';assert.equal(quizComplete(a),false);}
 assert.equal(quizComplete({confidence:'relative',boundary:'outside'}),false);
 assert.equal(canSubmitWork({...work,records:[records[0]]}),false);assert.equal(canSubmitWork({...work,observation:'太短'}),false);
});
test('readable reports include the score breakdown and five explanations',()=>{
 const feedback=quizResults(answers);assert.equal(feedback.length,5);assert.ok(feedback.every(r=>r.points===10&&r.selected===r.correctAnswer&&r.explanation));
 assert.doesNotMatch(reportText(work,false),/正确答案：|解释：|过程分：|得分明细：/);
 const text=reportText(work);assert.match(text,/对照实验 30\/30；观察与解释 20\/20；概念题 50\/50/);assert.equal((text.match(/正确答案：/g)||[]).length,5);assert.doesNotMatch(text,/undefined|NaN|对照60|概念题20分/);
});
test('all eleven artifacts retain attributed periods and sourced cultural learning notes without prices',async()=>{
 const rows=JSON.parse(await readFile(new URL('../public/assets/specimens.json',import.meta.url),'utf8'));
 assert.equal(rows.length,11);assert.ok(rows.every(r=>r.era&&r.source.startsWith('https://commons.wikimedia.org/')&&r.knowledge.value&&r.knowledge.compare&&r.knowledge.references.length));
 assert.ok(rows.every(r=>r.knowledge.datingBasis.includes('非AI断代')&&r.knowledge.scope.includes('非单件鉴定')));
 assert.ok(rows.every(r=>r.knowledge.references.every(ref=>/^https:\/\/(www\.dpm\.org\.cn|www\.lib\.ntu\.edu\.tw|sum\.scu\.edu\.cn)\//.test(ref.url))));
 assert.doesNotMatch(rows.find(r=>r.id==='qiong-lamp').description,/超出当前模型|三类/);
});
