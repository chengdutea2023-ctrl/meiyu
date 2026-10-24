import test from 'node:test';import assert from 'node:assert/strict';
import {ORIGINAL,triplet,grade,reportText,experimentFlow} from '../src/engine.js';
const r=(id,p={},prediction='壶')=>({specimenId:id,name:'执壶',phase:'实验',params:{...ORIGINAL,...p},prediction,values:[.1,.2,.7]});
test('guided experiments advance per specimen and repeat beyond twelve records',()=>{
 const records=[];
 assert.equal(experimentFlow(records,'a').step,'original');
 for(let round=0;round<5;round++){
  const original=r('a'), changed=r('a',{mask:true}), restored=r('a');
  records.push(original);
  assert.deepEqual(experimentFlow(records,'a'),{step:'change',records:[original,null,null]});
  records.push(r('b',{angle:45}));
  assert.equal(experimentFlow(records,'b').step,'original','A different specimen needs its own baseline');
  records.push(changed);
  assert.deepEqual(experimentFlow(records,'a'),{step:'restore',records:[original,changed,null]});
  records.push(restored);
  assert.deepEqual(experimentFlow(records,'a'),{step:'complete',records:[original,changed,restored]});
 }
 assert.equal(experimentFlow(JSON.parse(JSON.stringify(records)),'a').step,'complete');
});
test('legacy drafts require a baseline and a single-variable change',()=>{
 const original=r('a'), changed=r('a',{blur:2});
 assert.equal(experimentFlow([r('a',{mask:true})],'a').step,'original');
 assert.equal(experimentFlow([original,r('a',{blur:2,angle:30})],'a').step,'change');
 assert.equal(experimentFlow([original,changed],'a').step,'restore');
 assert.equal(experimentFlow([original,changed,r('a')],'a').step,'complete');
});
test('same-object chronological triplet requires exactly one changed variable',()=>{
 assert.equal(triplet([r('a'),r('b',{blur:2}),r('a')]),null);
 assert.equal(triplet([r('a'),r('a',{blur:2,angle:15}),r('a')]),null);
 assert.equal(triplet([r('a',{blur:2}),r('a'),r('a')]),null);
 assert.equal(triplet([r('a'),r('a',{mask:true}),r('a')]).length,3);
});
test('process scoring does not depend on AI being correct',()=>{
 const work={records:[r('a'),r('a',{angle:45}),r('a')],observation:'旋转后壶的分数降低，恢复后分数重新接近原图。',answers:{confidence:'relative',boundary:'outside'}};
 assert.equal(grade(work).score,100);work.records.forEach(r=>r.values=[.8,.1,.1]);assert.equal(grade(work).score,100);
 work.answers={confidence:'certain',boundary:'highest'};assert.equal(grade(work).score,80);
 assert.match(reportText(work),/未经概率校准/);
});
test('optional predictions never reduce a complete experiment score',()=>{
 const work={records:[r('a'),r('a',{mask:true}),r('a')],observation:'遮挡后分类分数改变，恢复后又接近原图的结果。',answers:{confidence:'relative',boundary:'outside'}};
 for(const prediction of ['',null,undefined,'碗']){
  work.records.forEach(record=>{record.prediction=prediction;});
  assert.deepEqual(grade(work),{score:100,evidence:60,explanation:20,concepts:20});
  const text=reportText(work);
  assert.match(text,/对照60分/);
  assert.doesNotMatch(text,/预测20分|undefined|null/);
  if(!prediction)assert.match(text,/我的预测（选填）：未填写/);
 }
 work.records.splice(1,1);
 assert.equal(grade(work).evidence,0,'Predictions cannot replace missing comparison evidence');
});
