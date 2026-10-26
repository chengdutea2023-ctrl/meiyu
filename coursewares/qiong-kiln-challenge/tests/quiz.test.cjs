const {test}=require('node:test');
const assert=require('node:assert/strict');
const Q=require('../static/quiz.js');
const comparison={version:'final-ai-comparison-v1',key:'fixture-final-1',baseline:{success:true},ai:{success:false},actions:[0,1,2],
 decision:{temperatureCelsius:1180,maturity:2,action:2,actionText:'降温'},policy:{names:['稳火保温型','省火低烧型','提前收火型']},observation:'最初我手动：烧成合格；这次AI：烧成不足。'};
const questions=Q.comparisonQuestions(comparison);
test('no legacy questions or process points are available before actual final evidence',()=>{
 assert.deepEqual(Q.questions,[]);assert.equal(Q.evaluate({},true).total,0);
 for(const c of [null,{}, {...comparison,version:'old'}, {...comparison,key:''}, {...comparison,ai:null}, {...comparison,actions:[]}, {...comparison,actions:[0,0]}, {...comparison,decision:null}, {...comparison,decision:{...comparison.decision,temperatureCelsius:NaN}}, {...comparison,decision:{...comparison.decision,maturity:9}}])assert.deepEqual(Q.comparisonQuestions(c),[]);
});
test('five distinct questions have one correct answer each and ten points per item',()=>{
 assert.equal(questions.length,5);assert.equal(new Set(questions.map(q=>q.id)).size,5);assert.equal(new Set(questions.map(q=>q.name)).size,5);
 for(const q of questions){assert.equal(q.options.length,3);assert.equal(q.options.filter(o=>o.value===q.correct).length,1);assert.ok(q.explanation);}
 assert.match(questions[0].title,/三组学习.*最初手动.*最后AI独立试烧/);assert.match(questions[1].title,/实际使用/);assert.match(questions[2].title,/1180℃/);
 assert.match(questions[3].title,/三组学习结束/);assert.match(questions[3].options.find(o=>o.value===questions[3].correct).text,/不再训练/);
 assert.doesNotMatch(JSON.stringify(questions),/两套|优先烧好|优先节能|程序烧/);
});
test('every correct answer adds exactly ten points to the fifty-point experiment',()=>{
 for(let count=0;count<=5;count++){
  const answers=Object.fromEntries(questions.map((q,index)=>[q.id,index<count?q.correct:q.options.find(o=>o.value!==q.correct).value]));
  const before=JSON.stringify(answers),result=Q.evaluate(answers,true,questions);
  assert.equal(result.answeredCount,5);assert.equal(result.correctCount,count);assert.equal(result.quizPoints,count*10);
  assert.equal(result.processPoints,50);assert.equal(result.total,50+count*10);assert.equal(result.maxPoints,100);assert.equal(JSON.stringify(answers),before);
  assert.equal(result.items.reduce((sum,q)=>sum+q.points,0),count*10);
 }
});
test('missing and invalid selections remain unanswered and cannot invent points',()=>{
 assert.equal(Q.evaluate({},false).total,0);assert.equal(Q.evaluate({},true).answeredCount,0);
 const answers=Object.fromEntries(questions.map(q=>[q.id,q.correct]));delete answers[questions[4].id];
 assert.equal(Q.evaluate(answers,true,questions).answeredCount,4);assert.equal(Q.evaluate(answers,true,questions).total,90);
 answers[questions[0].id]='not-an-option';assert.equal(Q.evaluate(answers,true,questions).answeredCount,3);
 assert.equal(Q.evaluate(Object.fromEntries(questions.map(q=>[q.id,q.correct])),false,questions).processPoints,0);
});
test('report snapshot freezes question, option, selected answer, correct answer and score independently',()=>{
 const answers=Object.fromEntries(questions.map(q=>[q.id,q.correct])),result=Q.evaluate(answers,true,questions);
 const snapshot=JSON.parse(JSON.stringify(result));assert.deepEqual(snapshot,result);assert.equal(snapshot.scoringVersion,'process50-quiz50-v1');
 assert.equal(snapshot.questionSetVersion,'final-evidence-quiz-v2');
 for(const item of result.items){assert.ok(item.question);assert.ok(item.selectedAnswerText);assert.ok(item.correctAnswerText);assert.equal(item.points,10);assert.equal(item.maxPoints,10);}
 result.items[0].options[0].text='changed';assert.notEqual(questions[0].options[0].text,'changed');
});
