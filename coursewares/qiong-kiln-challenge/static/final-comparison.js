(function(root){
  'use strict';
  const E=root.KilnEngine||require('./engine.js'),F=root.KilnFinalLearning||require('./final-learning.js'),T=root.KilnTemperature||require('./temperature.js');
  const VERSION='final-ai-comparison-v2';
  const PRESENTATION='manual-ai-results-v1';
  function seedFromEntropy(value){
    if(!Number.isInteger(value)||value<0||value>0xffffffff)throw new TypeError('Invalid kiln entropy');
    return 9000000+value%100000000;
  }
  const SCOPE='手动是连续控火，AI是离散教学模型；本次只观察结果和动作，不直接比较能耗、步数或判定谁更厉害。一次试烧不代表稳定合格率。';
  function describeOutcome(baseline,ai){
    const conclusion=baseline.success
      ?ai.success?'人工烧制与AI烧制均合格，本次结果相同；不能据此判断谁的控火能力更强。':'人工烧制合格，AI烧制未合格；可以根据失败原因继续调整示范和学习。'
      :ai.success?'人工烧制未合格，AI烧制合格；这只说明本次表现，不保证AI每窑成功。':'人工烧制与AI烧制均未合格；应分别查看失败原因，不能只凭这两次就认定学习没有作用。';
    return {aiResult:`AI烧制：${ai.result}。`,manualResult:`人工烧制（首次）：${baseline.result}。`,conclusion};
  }
  function metrics(baseline,learning){
    const t=learning?.test,valid=t&&Number.isInteger(t.samples)&&t.samples>0&&Number.isInteger(t.passed)&&t.passed>=0&&t.passed<=t.samples;
    return {manual:{passed:Number(baseline.success),samples:1,rate:Number(baseline.success)*100,scope:'earliest-manual-single-kiln'},ai:valid?{passed:t.passed,samples:t.samples,rate:Math.round(t.passed/t.samples*1000)/10,scope:'independent-final-policy-test'}:null};
  }
  function rateText(value){return value?`${value.rate}%（${value.passed}/${value.samples}窑，${value.scope==='earliest-manual-single-kiln'?'首次单窑':'独立测试'}）`:'未记录';}
  function current(state){
    const baseline=state.records.find(r=>r.mode==='manual'),ai=state.finalRecord,learning=state.finalLearning;
    if(!baseline||!F.matches(learning,state.snapshots)||!ai||ai.seed!==state.finalSeed||ai.purpose!==VERSION||ai.finalLearningId!==learning.id||JSON.stringify(ai.sourceExperimentIds)!==JSON.stringify(learning.sources.map(s=>s.trainingExperimentId))||!Number.isFinite(ai.playback?.activeSeconds)||ai.playback.activeSeconds<30||!Array.isArray(ai.trace)||ai.trace.length<2)return null;
    const actions=[...new Set(ai.trace.slice(1).map(p=>p.action))].sort();
    if(actions.some(a=>!E.ACTIONS[a]))return null;
    const index=Math.max(1,ai.trace.findIndex((p,i)=>i>0&&p.action===2)),before=ai.trace[index-1],step=ai.trace[index];
    const decision={temperatureCelsius:T.celsius(before.temp),maturity:before.maturity,tick:before.tick,action:step.action,actionText:E.ACTIONS[step.action]};
    return {version:VERSION,presentationVersion:PRESENTATION,key:ai.finalRunId,baseline:structuredClone(baseline),ai:structuredClone(ai),metrics:metrics(baseline,learning),
      policy:{kind:F.VERSION,names:learning.sources.map(s=>s.names.join('、')),learning:F.compact(learning)},
      actions,decision,observation:`人工烧制：${baseline.result}；AI烧制：${ai.result}。`,outcomeSummary:describeOutcome(baseline,ai),scope:SCOPE};
  }
  function compact(c){
    if(!c)return null;
    const record=r=>({result:r.result,success:r.success,energy:r.energy,steps:r.steps,seed:r.seed,simulatedDurationSeconds:r.simulatedDurationSeconds});
    return {version:c.version,presentationVersion:c.presentationVersion,key:c.key,baseline:record(c.baseline),ai:record(c.ai),metrics:structuredClone(c.metrics),policy:structuredClone(c.policy),actions:[...c.actions],decision:{...c.decision},observation:c.observation,outcomeSummary:structuredClone(c.outcomeSummary),scope:SCOPE};
  }
  function render(container,c){
    container.replaceChildren();container.hidden=!c;if(!c)return;
    const doc=container.ownerDocument,add=(tag,text,className)=>{const el=doc.createElement(tag);el.textContent=text;if(className)el.className=className;return el;};
    const summary=c.outcomeSummary,conclusion=add('div',null,'final-outcome-summary');conclusion.setAttribute('role','status');
    conclusion.append(add('p',summary.aiResult,'outcome-primary'),add('p',summary.manualResult),add('p',summary.conclusion));
    const image=doc.createElement('img');image.src=doc.getElementById('workshopCold')?.src||'./assets/workshop-clear.png';image.alt='邛窑虚拟窑场教学示意图，并非本次实物烧制照片';image.className='final-comparison-image';container.append(add('h3','人工烧制与AI烧制对照'),conclusion,image);
    const table=doc.createElement('table'),body=doc.createElement('tbody');
    for(const[label,a,b]of [['控制者','人工烧制','AI烧制'],['烧成结果',c.baseline.result,c.ai.result],['本次能耗（模拟值）',String(c.baseline.energy),String(c.ai.energy)],['成功率',rateText(c.metrics.manual),rateText(c.metrics.ai)],['操作方式','自己观察并切换加热、降温','根据学到的Q表（操作经验评分表）选择动作']]){
      const row=doc.createElement('tr');for(const[i,value]of [label,a,b].entries()){const cell=add(i?'td':'th',value);if(!i)cell.scope='row';row.append(cell);}body.append(row);
    }
    table.append(body);container.append(table,add('p','人工成功率仅来自首次完成的一窑，AI成功率来自独立批量测试；两列能耗为各自本次试烧的模拟值，不是同条件优劣排名。','comparison-scope'),add('p',`本次AI综合了三组经验：${c.policy.names.join('；')}。`),add('p',`独立${c.policy.learning.test.samples}窑测试：合格${c.policy.learning.test.passed}窑，平均能耗${c.policy.learning.test.energy}；本次验证较优，不保证全局最优或单窑成功。`),add('p',`实际用过：${c.actions.map(a=>E.ACTIONS[a]).join('、')}。`),add('p',`关键操作：看到${c.decision.temperatureCelsius}℃、进度${c.decision.maturity}/3时，选择${c.decision.actionText}。`),add('p',SCOPE,'comparison-scope'));
  }
  root.KilnFinalComparison={VERSION,PRESENTATION,seedFromEntropy,SCOPE,describeOutcome,metrics,rateText,current,compact,render};
  if(typeof module!=='undefined')module.exports=root.KilnFinalComparison;
})(typeof window!=='undefined'?window:globalThis);
