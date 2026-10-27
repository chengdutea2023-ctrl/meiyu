(function (root) {
  'use strict';
  const VERSION='final-evidence-quiz-v3';
  let activeQuestions=[],comparisonKey;
  function comparisonQuestions(c){
    if(!['final-ai-comparison-v1','final-ai-comparison-v2'].includes(c?.version)||typeof c.key!=='string'||!c.key||typeof c.baseline?.success!=='boolean'||typeof c.ai?.success!=='boolean')return [];
    const combined=c.version==='final-ai-comparison-v2';
    if(combined&&(c.policy?.kind!=='combined-experience-v1'||c.policy.learning?.sources?.length!==3||new Set(c.policy.learning.sources.map(s=>s.trainingExperimentId)).size!==3||c.policy.learning.sourcePracticeEpisodes!==900))return [];
    if(!Array.isArray(c.actions)||!c.actions.length||new Set(c.actions).size!==c.actions.length||c.actions.some(a=>![0,1,2].includes(a)))return [];
    const d=c.decision;
    if(!d||!c.actions.includes(d.action)||!Number.isFinite(d.temperatureCelsius)||d.temperatureCelsius<0||d.temperatureCelsius>1400||!Number.isInteger(d.maturity)||d.maturity<0||d.maturity>3||typeof d.actionText!=='string')return [];
    if(!Array.isArray(c.policy?.names)||c.policy.names.length!==3||c.policy.names.some(name=>typeof name!=='string'||!name)||typeof c.observation!=='string'||!c.observation)return [];
    const outcomes=[['both','我合格，AI也合格。'],['manual','我合格，AI未合格。'],['ai','我未合格，AI合格。'],['neither','我和AI都未合格。']];
    const outcome=c.baseline.success?(c.ai.success?'both':'manual'):(c.ai.success?'ai':'neither');
    const outcomeOptions=[outcomes.find(o=>o[0]===outcome),...outcomes.filter(o=>o[0]!==outcome).slice(0,2)].map(([value,text])=>({value,text}));
    outcomeOptions.push(outcomeOptions.shift());
    const labels=['加热','保持','降温'],actionKey=c.actions.join('-'),sets=[[0],[1],[2],[0,1],[0,2],[1,2],[0,1,2]];
    const actionOptions=[...sets.filter(a=>a.join('-')!==actionKey).slice(0,2),c.actions].map(a=>({value:a.join('-'),text:a.map(i=>labels[i]).join('、')+'。'}));
    return [
      {id:'final-outcome-v1',name:'concept',title:'完成三组学习后，最初手动与最后AI独立试烧的实际结果是哪一种？',correct:outcome,options:outcomeOptions,explanation:c.observation+'比较的是最早完成的手动试烧和额外进行的最终AI试烧，不是三组学习中的演示。失败也算完成实验。'},
      {id:'final-actions-v1',name:'concept-actions',title:'查看最终试烧记录，这次AI实际使用了哪些动作？',correct:actionKey,options:actionOptions,explanation:`本次最终试烧真实记录了${c.actions.map(i=>labels[i]).join('、')}。题目问的是这一窑实际用过的动作，不是AI所有可以选择的动作。`},
      {id:'final-decision-v1',name:'concept-policy',title:`查看这次最终试烧的关键操作：AI看到${c.decision.temperatureCelsius}℃、进度${c.decision.maturity}/3时，选择了什么？`,correct:String(c.decision.action),options:labels.map((text,i)=>({value:String(i),text:text+'。'})),explanation:`本次轨迹中，这一步选择了${c.decision.actionText}。AI根据当时状态和已经学到的动作价值作出选择，不是由学生在旁边点击控制。`},
      combined?{id:'final-learning-v3',name:'concept-comparison',title:'三组学习结束后，最终AI是怎样形成烧窑策略的？',correct:'experience',options:[{value:'copy',text:'直接复制我最初手动点击的顺序。'},{value:'experience',text:'汇总三组示范和试错经验继续学习，用独立验证选择较优策略；最后一窑只检验、不再训练。'},{value:'percent',text:'只挑其中一组直接执行，不参考其他两组的经验。'}],explanation:`本次实际汇总${c.policy.learning.demonstrationCount}次示范经验及${c.policy.learning.sourcePracticeEpisodes}轮试错记录，再练习${c.policy.learning.additionalPracticeEpisodes}轮；先按验证合格数、再按能耗和步数选择候选。独立测试和最后一窑不更新Q表（操作经验评分表），也不保证必胜。`}
      :{id:'final-learning-v2',name:'concept-comparison',title:'三组学习结束后，选定一组AI让它独立烧窑，正确的理解是什么？',correct:'experience',options:[{value:'experience',text:'每组分别学习；选定一组已学到的策略独立试烧，本窑只检验、不再训练。'},{value:'copy',text:'AI直接复制我最初手动点击的顺序，不需要之前的学习。'},{value:'percent',text:'AI把三组策略自动合并成必胜方案，最后一定烧成合格。'}],explanation:`本次选择的是“${c.policy.names.join('、')}”组合。每组都先参考所选三类示范，再自主试错；最终只运行选定组保存的Q表（操作经验评分表），不合并三组，也不在最后一窑继续训练。`},
      {id:'final-evidence-v1',name:'concept-retest',title:'看完最初手动与最终AI的对照，哪种结论有依据？',correct:'observed',options:[{value:'always-ai',text:'只要AI这次烧好了，以后每一窑都一定比人烧得好。'},{value:'observed',text:`${c.observation}这只说明本次表现；单窑不代表稳定合格率，两种模型的能耗也不能直接评胜负。`},{value:'always-manual',text:'只要AI这次失败，就说明之前三组学习完全没有用。'}],explanation:'依据本次真实结果和动作说明发现。实验完成与五题理解决定学习成绩，不按AI是否胜过人评分；评价稳定表现需要同模型、同窑况的多次检验。'}
    ];
  }
  function evaluate(answers, processComplete,questionSet=activeQuestions) {
    const items = questionSet.map(q => {
      const selected = q.options.find(option => option.value === answers[q.id]);
      const correct = q.options.find(option => option.value === q.correct), isCorrect = selected?.value === q.correct;
      return {id:q.id,question:q.title,options:q.options.map(option=>({...option})),selectedAnswer:selected?.value||'',
        selectedAnswerText:selected?.text||'',correctAnswer:q.correct,correctAnswerText:correct.text,
        answered:!!selected,isCorrect,points:isCorrect?10:0,maxPoints:10,explanation:q.explanation};
    });
    const quizPoints = items.reduce((sum,item)=>sum+item.points,0), processPoints = processComplete&&questionSet.length===5 ? 50 : 0;
    return {scoringVersion:'process50-quiz50-v1',questionSetVersion:VERSION,processPoints,quizPoints,total:processPoints+quizPoints,maxPoints:100,
      answeredCount:items.filter(item=>item.answered).length,correctCount:items.filter(item=>item.isCorrect).length,items};
  }
  function readAnswers() {
    return Object.fromEntries(activeQuestions.map(q=>[q.id,document.querySelector(`[name="${q.name}"]:checked`)?.value||'']));
  }
  function mount(container) {
    for (const [index,q] of activeQuestions.entries()) {
      const field = document.createElement('fieldset'); field.className='quiz'; field.dataset.questionId=q.id;
      const legend=document.createElement('legend');legend.textContent=`${index+1}. ${q.title}（10分）`;field.append(legend);
      for (const option of q.options) {
        const label=document.createElement('label'),input=document.createElement('input');input.type='radio';input.name=q.name;input.value=option.value;
        label.append(input,document.createTextNode(option.text));field.append(label);
      }
      container.append(field);
    }
  }
  function useComparison(container,c){
    const next=comparisonQuestions(c),key=next.length===5?c.key:null;if(comparisonKey===key)return false;
    comparisonKey=key;activeQuestions=next;container.querySelectorAll('.quiz').forEach(field=>field.remove());mount(container);return true;
  }
  root.KilnQuiz={VERSION,get questions(){return activeQuestions;},evaluate,readAnswers,mount,comparisonQuestions,useComparison};
  if(typeof module!=='undefined')module.exports=root.KilnQuiz;
})(typeof window!=='undefined'?window:globalThis);
