(function(root){
  'use strict';
  const E=root.KilnEngine||require('./engine.js'),D=root.KilnDemonstrations||require('./demonstrations.js'),T=root.KilnTemperature||require('./temperature.js');
  const VERSION='final-ai-comparison-v1';
  function seedFromEntropy(value){
    if(!Number.isInteger(value)||value<0||value>0xffffffff)throw new TypeError('Invalid kiln entropy');
    return 9000000+value%100000000;
  }
  const SCOPE='手动是连续控火，AI是离散教学模型；本次只观察结果和动作，不直接比较能耗、步数或判定谁更厉害。一次试烧不代表稳定合格率。';
  function current(state){
    const baseline=state.records.find(r=>r.mode==='manual'),ai=state.finalRecord,policy=D.latestTrials(state.snapshots).find(s=>s.id===state.finalPolicyId);
    if(!baseline||D.latestTrials(state.snapshots).length<D.REQUIRED_COMBINATIONS||!policy||!ai||ai.seed!==state.finalSeed||ai.purpose!==VERSION||ai.trainingExperimentId!==policy.id||ai.combinationId!==policy.combinationId||!Number.isFinite(ai.playback?.activeSeconds)||ai.playback.activeSeconds<30||!Array.isArray(ai.trace)||ai.trace.length<2)return null;
    const actions=[...new Set(ai.trace.slice(1).map(p=>p.action))].sort();
    if(actions.some(a=>!E.ACTIONS[a]))return null;
    const index=Math.max(1,ai.trace.findIndex((p,i)=>i>0&&p.action===2)),before=ai.trace[index-1],step=ai.trace[index];
    const decision={temperatureCelsius:T.celsius(before.temp),maturity:before.maturity,tick:before.tick,action:step.action,actionText:E.ACTIONS[step.action]};
    return {version:VERSION,key:ai.finalRunId,baseline:structuredClone(baseline),ai:structuredClone(ai),
      policy:{trainingExperimentId:policy.id,combinationId:policy.combinationId,selectedTypes:[...policy.selectedTypes],names:D.names(policy.selectedTypes)},
      actions,decision,observation:`最初我手动：${baseline.result}；这次AI：${ai.result}。`,scope:SCOPE};
  }
  function compact(c){
    if(!c)return null;
    const record=r=>({result:r.result,success:r.success,energy:r.energy,steps:r.steps,seed:r.seed,simulatedDurationSeconds:r.simulatedDurationSeconds});
    return {version:c.version,key:c.key,baseline:record(c.baseline),ai:record(c.ai),policy:structuredClone(c.policy),actions:[...c.actions],decision:{...c.decision},observation:c.observation,scope:SCOPE};
  }
  function render(container,c){
    container.replaceChildren();container.hidden=!c;if(!c)return;
    const doc=container.ownerDocument,add=(tag,text,className)=>{const el=doc.createElement(tag);el.textContent=text;if(className)el.className=className;return el;};
    const image=doc.createElement('img');image.src=doc.getElementById('workshopCold')?.src||'./assets/workshop-clear.png';image.alt='邛窑虚拟窑场教学示意图，并非本次实物烧制照片';image.className='final-comparison-image';container.append(image,add('h3','最初我来烧 · 最后AI自己烧'));
    const table=doc.createElement('table'),body=doc.createElement('tbody');
    for(const[label,a,b]of [['控制者','最初的我','本次AI'],['烧成结果',c.baseline.result,c.ai.result],['操作方式','自己观察并切换加热、降温','根据学到的Q表选择动作'],['操作记录',`${c.baseline.steps}次控火切换`,`${c.ai.steps}步决策`],['模型内能耗',String(c.baseline.energy),String(c.ai.energy)]]){
      const row=doc.createElement('tr');for(const[i,value]of [label,a,b].entries()){const cell=add(i?'td':'th',value);if(!i)cell.scope='row';row.append(cell);}body.append(row);
    }
    table.append(body);container.append(table,add('p',`本次AI使用：${c.policy.names.join('、')}。`),add('p',`实际用过：${c.actions.map(a=>E.ACTIONS[a]).join('、')}。`),add('p',`关键操作：看到${c.decision.temperatureCelsius}℃、进度${c.decision.maturity}/3时，选择${c.decision.actionText}。`),add('p',SCOPE,'comparison-scope'));
  }
  root.KilnFinalComparison={VERSION,seedFromEntropy,SCOPE,current,compact,render};
  if(typeof module!=='undefined')module.exports=root.KilnFinalComparison;
})(typeof window!=='undefined'?window:globalThis);
