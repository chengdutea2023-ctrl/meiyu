import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUE_ANALYSIS_VERSION, canAdoptCandidate, RELEVANCE_LABELS } from '../shared/clue-features.mjs';
import { evidencePayload, parseEvidenceResult } from '../server/evidence-provider.mjs';
import { assertFeatureAnalysis, publicEvidenceJob } from '../server/evidence-features.mjs';
import { restorationCase } from '../shared/restoration-cases.mjs';

const observed = { index:1, clueId:'clue-test', part:'口沿', feature:'宽盘口向外展开', region:[.1,.1,.8,.4], relevance:'irrelevant', reason:'宽盘口不能支持本次直口罐的口沿形状，请更换同类罐口照片。' };
const selection = { clueId:'clue-test', part:observed.part, feature:observed.feature, region:observed.region, origin:'ai_confirmed', analysisId:'analysis-test' };
const owner = relevance => ({assets:[{id:'clue-test',hash:'fixture-hash'}],evidenceJobs:[{id:'analysis-test',kind:'analysis',caseId:'four-ear-jar',state:'succeeded',promptVersion:CLUE_ANALYSIS_VERSION,clueHashes:{'clue-test':'fixture-hash'},items:[{...observed,relevance}]}]});

test('useful, partially useful, unsuitable and unreadable are distinct and only useful traits can be directly adopted',()=>{
  for(const relevance of ['direct','partial','irrelevant','unclear']) {
    assert.equal(parseEvidenceResult({items:[{...observed,relevance}]},'analysis',1)[0].relevance,relevance);
    assert.equal(canAdoptCandidate({relevance}),['direct','partial'].includes(relevance));
    assert.ok(RELEVANCE_LABELS[relevance]);
  }
  assert.equal(canAdoptCandidate(null),false);
  const prompt=evidencePayload({kind:'analysis',images:[],selectedCase:restorationCase()}).messages[1].content[0].text;
  assert.match(prompt,/feature、part和region必须仅描述可用的那一部分/);
  assert.match(prompt,/执壶宽盘口不能用来补直口罐/);
  assert.match(prompt,/不能与不适用混用/);
});

test('API rejects unsuitable AI traits and unchanged student relabels; genuinely different observations remain identified as student work',()=>{
  for(const relevance of ['irrelevant','unclear']) {
    for(const origin of ['ai_confirmed','student']) assert.throws(()=>assertFeatureAnalysis(owner(relevance),[{...selection,origin}],'four-ear-jar'),e=>e.code==='UNSUITABLE_FEATURE');
    const feature={...selection,origin:'student',part:'纹理',feature:'表面可见细小斑驳，仅参考表面质感，不参考口沿形状'};
    assert.doesNotThrow(()=>assertFeatureAnalysis(owner(relevance),[feature],'four-ear-jar'));
    assert.equal(feature.origin,'student');assert.equal(feature.aiObservation.relevance,relevance);
  }
  for(const relevance of ['direct','partial']) assert.doesNotThrow(()=>assertFeatureAnalysis(owner(relevance),[{...selection}],'four-ear-jar'));
});

test('old analyses require a fresh suitability check for new plans, without rewriting historical records',()=>{
  const old=owner('partial');delete old.evidenceJobs[0].promptVersion;
  const before=JSON.stringify(old);
  assert.throws(()=>assertFeatureAnalysis(old,[{...selection}],'four-ear-jar'),e=>e.code==='STALE_FEATURE');
  assert.equal(JSON.stringify(old),before);
  assert.equal(publicEvidenceJob(owner('direct').evidenceJobs[0]).promptVersion,CLUE_ANALYSIS_VERSION);
  assert.equal(publicEvidenceJob(old.evidenceJobs[0]).promptVersion,null);
});

test('real feature cards render distinct warnings and disabled adoption, while old analyses offer a fresh check',async()=>{
  const [{default:React},{renderToStaticMarkup},{default:ts},{default:vm},{readFile},shared,icons]=await Promise.all([import('react'),import('react-dom/server'),import('typescript'),import('node:vm'),import('node:fs/promises'),import('../shared/clue-features.mjs'),import('@phosphor-icons/react')]);
  const source=await readFile(new URL('../client/ClueFeatures.jsx',import.meta.url),'utf8'),module={exports:{}};
  vm.runInNewContext(ts.transpileModule(source,{fileName:'ClueFeatures.tsx',compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:id=>id==='react'?{...React,default:React}:id==='../shared/clue-features.mjs'?shared:id==='@phosphor-icons/react'?icons:{}});
  const render=(relevance,promptVersion=CLUE_ANALYSIS_VERSION)=>renderToStaticMarkup(React.createElement(module.exports.default,{selected:[{id:'clue-test'}],allAssets:[{id:'clue-test'}],selectedCase:restorationCase(),features:[],configured:true,jobs:[{id:'analysis-test',kind:'analysis',state:'succeeded',caseId:'four-ear-jar',clueIds:['clue-test'],promptVersion,items:[{...observed,relevance}]}]}));
  for(const relevance of ['direct','partial','irrelevant','unclear']) {
    const html=render(relevance);assert.ok(html.includes(RELEVANCE_LABELS[relevance]));
    if(['irrelevant','unclear'].includes(relevance))assert.match(html,/<button class="feature-adopt" disabled="">这条特征暂不能采用/);
    else assert.match(html,/<button class="feature-adopt">采用这个特征/);
  }
  const legacy=render('partial','clue-feature-link-v1');assert.match(legacy,/重新检查素材用途/);assert.doesNotMatch(legacy,/AI找到的部位/);
});
