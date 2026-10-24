import test from 'node:test';import assert from 'node:assert/strict';
import {ORIGINAL,comparison,grade,reportText,experimentFlow} from '../src/engine.js';
const r=(id,p={},prediction='壶')=>({specimenId:id,name:'执壶',phase:Object.keys(p).length?'变化后':'原图',params:{...ORIGINAL,...p},prediction,values:[.1,.2,.7]});
test('two chronological images of one specimen form evidence without restoration',()=>{
 const original=r('a'), changed=r('a',{mask:true});
 assert.deepEqual(comparison([original,changed]),[original,changed]);
 assert.equal(comparison([original,r('b',{blur:2})]),null);
 assert.equal(comparison([original,r('a',{blur:2,angle:15})]),null);
 assert.equal(comparison([changed,original]),null);
 assert.equal(comparison([original,r('a')]),null);
});
test('one baseline is reused across further experiments and other specimens stay independent',()=>{
 const original=r('a'),records=[original];
 assert.deepEqual(experimentFlow([],'a'),{step:'original',records:[null,null]});
 assert.deepEqual(experimentFlow(records,'a'),{step:'change',records:[original,null]});
 for(let i=0;i<14;i++){
  const changed=r('a',{blur:i+1});records.push(changed);
  assert.deepEqual(experimentFlow(records,'a'),{step:'complete',records:[original,changed]});
  assert.deepEqual(comparison(records),[original,changed]);
 }
 assert.equal(experimentFlow(records,'b').step,'original');
 assert.equal(experimentFlow(JSON.parse(JSON.stringify(records)),'a').step,'complete');
});
test('legacy restored-original records remain compatible and cannot replace a changed image',()=>{
 const original=r('a'),changed=r('a',{angle:30}),restored=r('a');
 const records=[original,changed,restored];
 assert.deepEqual(experimentFlow(records,'a'),{step:'complete',records:[original,changed]});
 assert.deepEqual(comparison(records),[original,changed]);
 assert.equal(experimentFlow([r('a',{mask:true})],'a').step,'original');
 assert.equal(experimentFlow([original,r('a',{blur:2,angle:30})],'a').step,'change');
});
test('two-image process scoring does not depend on AI being correct',()=>{
 const work={records:[r('a'),r('a',{angle:45})],observation:'旋转后壶的分数降低，模型对器物朝向变化敏感。',answers:{confidence:'relative',boundary:'outside'}};
 assert.equal(grade(work).score,100);work.records.forEach(r=>r.values=[.8,.1,.1]);assert.equal(grade(work).score,100);
 work.answers={confidence:'certain',boundary:'highest'};assert.equal(grade(work).score,80);
 assert.match(reportText(work),/两次识别即可/);assert.match(reportText(work),/未经概率校准/);
 work.records.pop();assert.equal(grade(work).evidence,0);
});
test('optional predictions never reduce a two-image comparison score',()=>{
 const work={records:[r('a'),r('a',{mask:true})],observation:'遮挡后分类分数改变，说明图片线索会影响模型判断。',answers:{confidence:'relative',boundary:'outside'}};
 for(const prediction of ['',null,undefined,'碗']){
  work.records.forEach(record=>{record.prediction=prediction;});
  assert.deepEqual(grade(work),{score:100,evidence:60,explanation:20,concepts:20});
  const text=reportText(work);assert.match(text,/对照60分/);assert.doesNotMatch(text,/预测20分|undefined|null/);
  if(!prediction)assert.match(text,/我的预测（选填）：未填写/);
 }
});
