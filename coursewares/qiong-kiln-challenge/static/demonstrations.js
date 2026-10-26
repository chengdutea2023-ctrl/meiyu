(function (root) {
  'use strict';
  const E = root.KilnEngine || require('./engine.js');
  const VERSION = 'demonstrations-v1';
  const CONFIG = Object.freeze({ perType: 20, replayPasses: 5, practiceEpisodes: 300, demonstrationSeed: 2500001, seedStride: 79, shuffleSeed: 733, practiceSeed: 815 });
  const TYPES = Object.freeze([
    Object.freeze({id:'steady',name:'稳火保温型',description:'适度升温，保持火候，烧熟后降温。'}),
    Object.freeze({id:'rush',name:'猛火冲刺型',description:'未烧熟时持续加热，追求快速升温。'}),
    Object.freeze({id:'low',name:'省火低烧型',description:'尽量在烧成区较低温度维持火候。'}),
    Object.freeze({id:'early',name:'提前收火型',description:'刚有一点烧成进度，就持续降温。'}),
    Object.freeze({id:'alternate',name:'反复调温型',description:'加热、降温交替，烧熟后持续降温。'})
  ]);
  const SEEDS = Object.freeze(Array.from({length:CONFIG.perType},(_,i)=>CONFIG.demonstrationSeed+CONFIG.seedStride*i));
  function selection(ids) {
    if (!Array.isArray(ids) || ids.length !== 3 || new Set(ids).size !== 3 || ids.some(id=>!TYPES.some(t=>t.id===id))) return null;
    return TYPES.filter(t=>ids.includes(t.id)).map(t=>t.id);
  }
  function combinationId(ids) { return selection(ids)?.join('+') || ''; }
  function secondSelection(ids,firstIds) {
    const selected=selection(ids),first=combinationId(firstIds);
    return selected&&first&&combinationId(selected)!==first?selected:null;
  }
  function names(ids) { return (selection(ids)||[]).map(id=>TYPES.find(t=>t.id===id).name); }
  function action(id,s) {
    if(!TYPES.some(t=>t.id===id))throw new Error('Unknown demonstration type');
    if(s.maturity>=3)return 2;
    if(id==='rush')return 0;
    if(id==='alternate')return s.tick%2===0?0:2;
    if(id==='early'&&s.maturity>=1)return 2;
    return s.temp<(id==='steady'?65:58)?0:1;
  }
  function example(id,seed) {
    const s=E.create(seed,E.CLASSROOM_PROFILE.disturbance,E.CLASSROOM_PROFILE),transitions=[];
    while(!s.done){
      const state={temp:s.temp,maturity:s.maturity,tick:s.tick},a=action(id,s);
      const {reward,done}=E.step(s,a,E.DEFAULT_REWARDS);
      transitions.push({state,action:a,reward,nextState:{temp:s.temp,maturity:s.maturity,tick:s.tick},done});
    }
    return {strategyId:id,source:'scripted-teaching-demonstration',seed,conditions:{...s.conditions},result:s.reason,success:s.success,energy:s.energy,trace:s.trace,transitions};
  }
  function examples(ids) {
    const selected=selection(ids);if(!selected)throw new Error('Select exactly three different demonstrations');
    return selected.flatMap(id=>SEEDS.map(seed=>example(id,seed)));
  }
  function learnExamples(q,runs) {
    const rows=runs.flatMap(r=>r.transitions),rng=E.random(CONFIG.shuffleSeed);
    for(let pass=0;pass<CONFIG.replayPasses;pass++){
      const order=rows.slice();
      for(let i=order.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
      for(const t of order){
        const key=E.key(t.state),next=t.done?0:Math.max(...E.values(q,t.nextState));
        if(!q[key])q[key]=[0,0,0];
        q[key][t.action]+=.24*(t.reward+.97*next-q[key][t.action]);
      }
    }
    return rows.length*CONFIG.replayPasses;
  }
  function evaluate(q) { return E.evaluate(q,'ai',E.DEFAULT_REWARDS,E.CLASSROOM_PROFILE.disturbance,E.CLASSROOM_PROFILE); }
  function prepare(ids) {
    const selected=selection(ids);if(!selected)throw new Error('Select exactly three different demonstrations');
    const q={},runs=examples(selected),before=evaluate(q),updates=learnExamples(q,runs);
    return {q,demonstrations:runs,before,afterDemonstrations:evaluate(q),demonstrationUpdates:updates};
  }
  function practice(q,index) { return E.episode(q,index,E.DEFAULT_REWARDS,CONFIG.practiceSeed,E.CLASSROOM_PROFILE.disturbance,CONFIG.practiceEpisodes,E.CLASSROOM_PROFILE); }
  function complete(s) {
    return s?.demonstrationVersion===VERSION && combinationId(s.selectedTypes)===s.combinationId && !!s.combinationId &&
      !s.stopped && s.episodes===CONFIG.practiceEpisodes && s.demonstrationCount===CONFIG.perType*3 &&
      s.after?.samples===100 && s.after?.environmentId===E.CLASSROOM_PROFILE.id && s.after?.cohortId==='paired-100-v1';
  }
  function latestTrials(snapshots) {
    const latest=new Map();for(const s of snapshots)if(complete(s))latest.set(s.combinationId,s);
    return [...latest.values()];
  }
  function modelMatches(state) {
    return !!state.trained && !!combinationId(state.selectedTypes) && combinationId(state.selectedTypes)===state.modelCombinationId;
  }
  function insight(snapshots) {
    const latest=latestTrials(snapshots);
    if(latest.length<2)return '再换至少一种示范，完成第二套组合，用相同窑况比较。';
    const [a,b]=latest.slice(-2);
    if(a.after.samples!==b.after.samples||a.after.environmentId!==b.after.environmentId||a.after.cohortId!==b.after.cohortId||a.episodes!==b.episodes)return '测试条件不同，不能直接比较。';
    const equal=a.after.rate===b.after.rate&&a.after.energy===b.after.energy;
    return `${equal?'最终表现相同；自主试错后可能学到了相近方法。':`最近两套组合最终合格率${a.after.rate}% → ${b.after.rate}%，平均能耗${a.after.energy} → ${b.after.energy}。`} 示范影响学习起点，失败反馈也能帮助调整；结果不保证变好。`;
  }
  root.KilnDemonstrations={VERSION,CONFIG,TYPES,SEEDS,selection,secondSelection,combinationId,names,action,example,examples,learnExamples,evaluate,prepare,practice,complete,latestTrials,modelMatches,insight};
  if(typeof module!=='undefined')module.exports=root.KilnDemonstrations;
})(typeof window!=='undefined'?window:globalThis);
