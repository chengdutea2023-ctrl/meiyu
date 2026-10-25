const {test}=require('node:test');
const assert=require('node:assert/strict');
const Q=require('../static/quiz.js');
test('five distinct questions have one correct answer each and ten points per item',()=>{
 assert.equal(Q.questions.length,5);assert.equal(new Set(Q.questions.map(q=>q.id)).size,5);assert.equal(new Set(Q.questions.map(q=>q.name)).size,5);
 for(const q of Q.questions){assert.equal(q.options.length,3);assert.equal(q.options.filter(o=>o.value===q.correct).length,1);assert.ok(q.explanation);}
});
test('every correct answer adds exactly ten points to the fifty-point experiment',()=>{
 for(let count=0;count<=5;count++){
  const answers=Object.fromEntries(Q.questions.map((q,index)=>[q.id,index<count?q.correct:q.options.find(o=>o.value!==q.correct).value]));
  const before=JSON.stringify(answers),result=Q.evaluate(answers,true);
  assert.equal(result.answeredCount,5);assert.equal(result.correctCount,count);assert.equal(result.quizPoints,count*10);
  assert.equal(result.processPoints,50);assert.equal(result.total,50+count*10);assert.equal(result.maxPoints,100);assert.equal(JSON.stringify(answers),before);
  assert.equal(result.items.reduce((sum,q)=>sum+q.points,0),count*10);
 }
});
test('missing and invalid selections remain unanswered and cannot invent points',()=>{
 assert.equal(Q.evaluate({},false).total,0);assert.equal(Q.evaluate({},true).answeredCount,0);
 const answers=Object.fromEntries(Q.questions.map(q=>[q.id,q.correct]));delete answers[Q.questions[4].id];
 assert.equal(Q.evaluate(answers,true).answeredCount,4);assert.equal(Q.evaluate(answers,true).total,90);
 answers[Q.questions[0].id]='not-an-option';assert.equal(Q.evaluate(answers,true).answeredCount,3);
 assert.equal(Q.evaluate(Object.fromEntries(Q.questions.map(q=>[q.id,q.correct])),false).processPoints,0);
});
test('report snapshot freezes question, option, selected answer, correct answer and score independently',()=>{
 const answers=Object.fromEntries(Q.questions.map(q=>[q.id,q.correct])),result=Q.evaluate(answers,true);
 const snapshot=JSON.parse(JSON.stringify(result));assert.deepEqual(snapshot,result);assert.equal(snapshot.scoringVersion,'process50-quiz50-v1');
 for(const item of result.items){assert.ok(item.question);assert.ok(item.selectedAnswerText);assert.ok(item.correctAnswerText);assert.equal(item.points,10);assert.equal(item.maxPoints,10);}
 result.items[0].options[0].text='changed';assert.notEqual(Q.questions[0].options[0].text,'changed');
});
