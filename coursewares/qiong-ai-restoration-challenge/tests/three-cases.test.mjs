import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { RESTORATION_CASES, DEFAULT_CASE_ID, restorationCase, proposalCase } from '../shared/restoration-cases.mjs';
import { validateProposalDraft, restoreProposalDraft } from '../shared/proposal-progress.mjs';
import { normalizedMask, compositeMasked, digest } from '../server/domain.mjs';
import { proposalPrompt } from '../server/proposal-prompt.mjs';
const asset=file=>new URL('../static/assets/'+file,import.meta.url);
test('three distinct credited objects have separate matching teaching masks, with pixel protection for every type',async()=>{
 assert.equal(RESTORATION_CASES.length,3);assert.equal(new Set(RESTORATION_CASES.map(c=>c.type)).size,3);
 const hashes=[];
 for(const c of RESTORATION_CASES){
  assert.ok(c.sourcePage.startsWith('https://commons.wikimedia.org/wiki/File:'));assert.equal(c.photographer,'Kcx36');assert.equal(c.license,'CC BY-SA 4.0');
  const image=await readFile(asset(c.damagedFile)),png=await readFile(asset(c.maskFile)),{width,height}=await sharp(image).metadata();
  hashes.push(digest(image));const mask=await normalizedMask(png,width,height);
  const generated=await sharp({create:{width,height,channels:3,background:'#ff004c'}}).png().toBuffer();
  const composite=await sharp(await compositeMasked(image,generated,mask.data)).ensureAlpha().raw().toBuffer(),base=await sharp(image).ensureAlpha().raw().toBuffer();
  let changed=0;
  for(let p=0;p<width*height;p++){const before=base.subarray(p*4,p*4+4),after=composite.subarray(p*4,p*4+4);if(mask.data[p]===255){if(!before.equals(after))changed++;}else assert.ok(before.equals(after),'unmasked pixels must stay exact');}
  assert.equal(changed,mask.pixels);
  const prompt=proposalPrompt('参考线索1的形状补齐缺口',[{label:'线索1',feature:'我发现同类器物的轮廓'}],mask.bounds,width,height,c);
  assert.ok(prompt.includes(c.name));assert.ok(prompt.includes(c.damage));assert.ok(prompt.includes('图2是线索1'));
 }
 assert.equal(new Set(hashes).size,3);assert.equal(restorationCase('invented'),undefined);assert.equal(proposalCase({snapshot:{}}).id,DEFAULT_CASE_ID);
});
test('case identity survives drafts, progress restore and frozen plans without converting old work',()=>{
 const draft={version:2,ownerId:'student-task',resetVersion:0,step:1,caseId:'song-bowl',clueIds:['clue1'],proposalText:'沿现有轮廓补齐碗沿',maskDataUrl:'',proposalId:null};
 const session={ownerId:draft.ownerId,resetVersion:0,assets:[{id:'clue1',role:'clue'}],proposals:[]};
 assert.equal(restoreProposalDraft(draft,session).caseId,'song-bowl');
 const old={...draft};delete old.caseId;assert.equal(validateProposalDraft(old).caseId,DEFAULT_CASE_ID);
 assert.throws(()=>validateProposalDraft({...draft,caseId:'../../private'}),/进度包/);
 const saved={id:'saved',snapshot:{caseId:'brown-ewer',clueIds:['clue1'],proposalText:'执壶方案'},maskDataUrl:''};
 assert.equal(restoreProposalDraft({...draft,proposalId:saved.id},{...session,proposals:[saved]}).caseId,'brown-ewer');
 const legacy={...saved,snapshot:{...saved.snapshot}};delete legacy.snapshot.caseId;
 assert.equal(restoreProposalDraft({...draft,proposalId:legacy.id},{...session,proposals:[legacy]}).caseId,DEFAULT_CASE_ID);
});

test('the real plan-picture component renders every case and historical plans without undefined imports',async()=>{
 const [{default:React},{renderToStaticMarkup},{default:ts},{default:vm},cases]=await Promise.all([import('react'),import('react-dom/server'),import('typescript'),import('node:vm'),import('../shared/restoration-cases.mjs')]);
 const source=await readFile(new URL('../client/PlanPicture.jsx',import.meta.url),'utf8'),module={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{fileName:'PlanPicture.tsx',compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:id=>id==='react'?{...React,default:React}:id==='./report'?{loadImage:()=>{throw Error('effects must not run in SSR');}}:id==='../shared/restoration-cases.mjs'?cases:null});
 for(const c of [...RESTORATION_CASES,{id:undefined,shortName:'四系罐'}])assert.ok(renderToStaticMarkup(React.createElement(module.exports.default,{proposal:{id:'plan',snapshot:{caseId:c.id}}})).includes(c.shortName+'与计划修复的位置'));
});
