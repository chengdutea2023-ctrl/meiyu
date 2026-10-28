import test from 'node:test';
import assert from 'node:assert/strict';
import { proposalAllowance, needsPromptUpgrade, PROPOSAL_PROMPT_VERSION } from '../shared/proposal-generation.mjs';
import { proposalPrompt,materialPrompt } from '../server/proposal-prompt.mjs';

const version = id => ({id,kind:'proposal',workflowVersion:2,results:[{state:'succeeded'}]});
test('three generation opportunities preserve existing use across reset, restore and duplicate archived IDs', () => {
  const a=version('a'),b=version('b');
  assert.deepEqual(proposalAllowance({proposalGenerationCount:2,tasks:[b],resetHistory:[{tasks:[a]},{restored:true,tasks:[b]}]}),{used:2,limit:3,remaining:1});
  assert.deepEqual(proposalAllowance({tasks:[a,b,version('c')],resetHistory:[]}),{used:3,limit:3,remaining:0});
  assert.deepEqual(proposalAllowance({proposalGenerationCount:4,tasks:[]}),{used:4,limit:3,remaining:0});
  const retry={...a,results:[{state:'succeeded',attempts:2}]};
  assert.deepEqual(proposalAllowance({tasks:[retry],resetHistory:[{tasks:[a,retry]}]}),{used:2,limit:3,remaining:1});
  assert.deepEqual(proposalAllowance({tasks:[{id:'legacy',results:[{attempts:1},{attempts:1},{attempts:1}]}]}),{used:3,limit:3,remaining:0});
});
test('an old ungenerated plan gets a new prompt snapshot; generated and current plans keep their frozen requests', () => {
  assert.equal(needsPromptUpgrade({snapshot:{},results:[]}),true);
  assert.equal(needsPromptUpgrade({snapshot:{},results:[{state:'succeeded'}]}),false);
  assert.equal(needsPromptUpgrade({snapshot:{promptVersion:PROPOSAL_PROMPT_VERSION},results:[]}),false);
});
test('the student material instruction has priority over clue glaze, with distinct gold and titanium rendering and no invented historical claim', () => {
  for(const text of ['我想把这个缺口用金子补上。','我想用钛合金补上缺口。','我想沿着线索1补成同样的绿色釉口。']){
    const p=proposalPrompt(text,[{label:'线索1',feature:'青绿色陶瓷釉面'}],[100,50,200,100],1000,500);
    assert.ok(p.includes(text));assert.ok(p.includes('<bbox>100 100 200 200</bbox>'));
    assert.ok(p.indexOf(text)<p.indexOf('图2是线索1'));assert.ok(p.includes('不能被参考照片原有的陶瓷釉色覆盖'));
    assert.equal(p.includes('金黄色金属表面与高光'),/金子/.test(text));assert.equal(p.includes('银灰色金属'),/钛合金/.test(text));
    assert.ok(p.includes('沿用待修复器物相邻釉面'));assert.ok(p.includes('不表示历史上确实采用过'));
  }
});
test('an unspecified or negated material never injects an unrelated gold/titanium example into either workflow',()=>{
  const clues=[{id:'clue-12345678',label:'线索3',feature:'333'}];
  const legacy=proposalPrompt('按照我提供的线索复原',clues,[740,361,930,499],1000,1000);
  assert.doesNotMatch(legacy,/黄金|金子|金色|金缮|钛合金/);
  const linked=proposalPrompt('参照线索3的壶流复原',clues,[740,361,930,499],1000,1000,undefined,{featureWorkflow:1,featureSelections:[{clueId:clues[0].id,part:'壶流',feature:'短而向上翘',region:[.2,.2,.8,.5]}],creativeText:''});
  assert.doesNotMatch(linked,/黄金|金子|金色|金缮|钛合金/);
  for(const text of ['不要用黄金','不用钛合金，只按原釉色','不是黄金，采用钛合金','用黄金但不要增加纹样'])assert.doesNotMatch(materialPrompt(text),/本次明确采用|金黄色金属表面与高光|银灰色金属/);
});
