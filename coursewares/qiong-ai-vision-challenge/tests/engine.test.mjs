import test from 'node:test';import assert from 'node:assert/strict';
import {ORIGINAL,triplet,grade,reportText} from '../src/engine.js';
const r=(id,p={},prediction='壶')=>({specimenId:id,name:'执壶',phase:'实验',params:{...ORIGINAL,...p},prediction,values:[.1,.2,.7]});
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
