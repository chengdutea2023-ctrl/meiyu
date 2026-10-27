(function(root){
  'use strict';
  const E=root.KilnEngine||require('./engine.js'),D=root.KilnDemonstrations||require('./demonstrations.js');
  const VERSION='combined-experience-v1',P=E.CLASSROOM_PROFILE;
  const CONFIG=Object.freeze({replayPasses:5,practiceEpisodes:300,practiceSeed:3100001,validationSeed:3700001,testSeed:4700001,samples:100,stride:47});
  const VALIDATION=Object.freeze({id:'combined-validation-100-v1',seeds:Object.freeze(Array.from({length:100},(_,i)=>CONFIG.validationSeed+i*CONFIG.stride))});
  const TEST=Object.freeze({id:'combined-test-100-v1',seeds:Object.freeze(Array.from({length:100},(_,i)=>CONFIG.testSeed+i*CONFIG.stride))});
  const sources=snapshots=>D.latestTrials(snapshots).slice(0,D.REQUIRED_COMBINATIONS);
  function sourceKey(snapshots){const s=sources(snapshots);return s.length===3?VERSION+':'+s.map(t=>t.id+'@'+t.combinationId).join('|'):'';}
  const experienceKey=ids=>'practice-v1:'+D.combinationId(ids);
  function validTransition(t){
    const state=s=>s&&Number.isFinite(s.temp)&&s.temp>=0&&s.temp<=100&&Number.isInteger(s.tick)&&s.tick>=0&&s.tick<=22&&Number.isInteger(s.maturity)&&s.maturity>=0&&s.maturity<=3;
    return state(t.state)&&state(t.nextState)&&[0,1,2].includes(t.action)&&Number.isFinite(t.reward)&&typeof t.done==='boolean'&&t.nextState.tick===t.state.tick+1;
  }
  function practiceData(run,index){return {seed:D.CONFIG.practiceSeed+67*index,success:run.success,result:run.reason,energy:run.energy,transitions:run.transitions};}
  function evaluate(q,cohort){return E.evaluate(q,'ai',E.DEFAULT_REWARDS,P.disturbance,P,cohort);}
  function better(a,b){return !b||a.passed>b.passed||a.passed===b.passed&&(a.totalEnergy<b.totalEnergy||a.totalEnergy===b.totalEnergy&&a.steps<b.steps);}
  function learn(snapshots,demonstrationLibrary,practiceLibrary){
    const trials=sources(snapshots),key=sourceKey(snapshots);if(!key)throw new Error('请先完成三组不同示范的学习');
    const runs=[],counts=[];
    for(const s of trials){
      if(Object.keys(E.DEFAULT_REWARDS).some(k=>s.rewards?.[k]!==E.DEFAULT_REWARDS[k]))throw new Error('三组反馈标准不一致，不能综合学习');
      const demos=s.selectedTypes.flatMap(id=>{
        const library=demonstrationLibrary[id];if(!Array.isArray(library)||library.length!==D.CONFIG.perType)throw new Error('缺少实际示范经验');
        if(library.some((r,i)=>r.strategyId!==id||r.seed!==D.SEEDS[i]))throw new Error('示范来源不一致');return library;
      });
      const practice=practiceLibrary[s.practiceExperienceKey];
      if(s.practiceExperienceKey!==experienceKey(s.selectedTypes)||!Array.isArray(practice)||practice.length!==300||practice.some((r,i)=>r.seed!==D.CONFIG.practiceSeed+67*i))throw new Error('缺少本组实际试错经验，请重新学习');
      const selected=[...demos,...practice];
      if(selected.some(r=>!Array.isArray(r.transitions)||!r.transitions.length||r.transitions.some(t=>!validTransition(t))||r.transitions.at(-1).done!==true))throw new Error('学习经验不完整');
      runs.push(...selected);counts.push({trainingExperimentId:s.id,combinationId:s.combinationId,selectedTypes:[...s.selectedTypes],names:D.names(s.selectedTypes),demonstrations:demos.length,practiceEpisodes:practice.length,transitions:selected.reduce((n,r)=>n+r.transitions.length,0)});
    }
    const q={},updates=D.learnExamples(q,runs),candidates=[];let best=null,bestQ,bestId;
    const consider=id=>{const result=evaluate(q,VALIDATION);candidates.push({id,validation:result});if(better(result,best)){best=result;bestId=id;bestQ=structuredClone(q);}};
    consider('experience-replay');
    const practice=[];
    for(let i=0;i<CONFIG.practiceEpisodes;i++){
      const run=E.episode(q,i,E.DEFAULT_REWARDS,CONFIG.practiceSeed,P.disturbance,CONFIG.practiceEpisodes,P,true);
      practice.push({seed:CONFIG.practiceSeed+67*i,success:run.success,result:run.reason,energy:run.energy,transitions:run.transitions});
      if((i+1)%100===0)consider('combined-practice-'+(i+1));
    }
    return {version:VERSION,id:key,sourceKey:key,config:{...CONFIG},sources:counts,demonstrationCount:counts.reduce((n,s)=>n+s.demonstrations,0),sourcePracticeEpisodes:counts.reduce((n,s)=>n+s.practiceEpisodes,0),replayPasses:CONFIG.replayPasses,experienceTransitions:runs.reduce((n,r)=>n+r.transitions.length,0),experienceUpdates:updates,
      additionalPracticeEpisodes:practice.length,practiceSeed:CONFIG.practiceSeed,practiceRuns:practice,selectionRule:'validation-passed-desc-energy-asc-steps-asc-v1',candidates,selectedCandidateId:bestId,validation:best,validationSeeds:[...VALIDATION.seeds],test:evaluate(bestQ,TEST),testSeeds:[...TEST.seeds],qTable:bestQ};
  }
  function matches(learning,snapshots){return learning?.version===VERSION&&learning.sourceKey===sourceKey(snapshots)&&learning.sources?.length===3&&learning.additionalPracticeEpisodes===300&&learning.qTable&&Object.keys(learning.qTable).length>0;}
  function compact(learning){
    if(!learning)return null;const {qTable,practiceRuns,...data}=learning;return structuredClone(data);
  }
  root.KilnFinalLearning={VERSION,CONFIG,VALIDATION,TEST,sources,sourceKey,experienceKey,practiceData,better,learn,matches,compact};
  if(typeof module!=='undefined')module.exports=root.KilnFinalLearning;
})(typeof window!=='undefined'?window:globalThis);
