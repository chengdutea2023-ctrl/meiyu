(function (root) {
  'use strict';
  const questions = [
    {id:'demonstration-influence-v1', name:'concept', title:'为什么换一组示范，AI学到的烧窑方法可能不同？', correct:'learned', options:[
      {value:'fixed',text:'AI只按示范的名称决定合格率。'},
      {value:'learned',text:'示范改变了最先接触的经验，AI还会通过试错反馈调整。'},
      {value:'perfect',text:'选了三种示范，AI就一定能烧好所有窑。'}], explanation:'所选示范真正参与经验学习，但AI还会自主试错；示范不是保证成功的配方。'},
    {id:'kiln-actions-v1', name:'concept-actions', title:'本课件中，AI可以选择哪些烧窑动作？', correct:'heat-hold-cool', options:[
      {value:'heat-hold-cool',text:'加热、保持、降温。'},
      {value:'choose-score',text:'直接选择本次实验的合格率。'},
      {value:'change-report',text:'删除失败记录、修改报告分数。'}], explanation:'AI选择的是加热、保持或降温；合格率来自实际测试结果。'},
    {id:'learned-policy-v1', name:'concept-policy', title:'AI通过反复试烧和反馈，主要学到什么？', correct:'state-actions', options:[
      {value:'real-recipe',text:'所有真实窑炉都适用的烧制配方。'},
      {value:'state-actions',text:'不同窑炉状态下，哪些动作更值得选择。'},
      {value:'fixed-repeat',text:'无论温度怎样，都重复同一个动作。'}], explanation:'它根据模拟窑炉状态和反馈，学习不同动作的价值，不是真实烧制配方。'},
    {id:'paired-demonstrations-v1', name:'concept-comparison', title:'怎样公平比较不同示范组合对学习的帮助？', correct:'paired-results', options:[
      {value:'energy-only',text:'只看演示的一窑有没有成功。'},
      {value:'different-tests',text:'给喜欢的组合更多练习和更容易的测试。'},
      {value:'paired-results',text:'使用相同练习量和测试窑况，比较学习变化、合格数量和能耗。'}], explanation:'只改变示范组合，保持反馈、练习量和测试条件一致，保留失败结果，才便于比较。'},
    {id:'similar-results-v1', name:'concept-retest', title:'不同组合最终合格率相同，能得出什么结论？', correct:'similar-policies', options:[
      {value:'similar-policies',text:'自主试错后可能学到了相近方法，还要看学习过程和能耗。'},
      {value:'no-learning',text:'说明AI没有学习，所有示范都没有用。'},
      {value:'set-percent',text:'应该修改显示数据，让两组看起来不同。'}], explanation:'相近的最终结果不代表经历相同，更不能人为改数。示范后的起点、自主练习后的变化和能耗都值得观察。'}
  ];
  let activeQuestions=questions,comparisonKey;
  function comparisonQuestions(c){
    if(!c)return [];
    const outcomes=[['both','我合格，AI也合格。'],['manual','我合格，AI未合格。'],['ai','我未合格，AI合格。'],['neither','我和AI都未合格。']];
    const outcome=c.baseline.success?(c.ai.success?'both':'manual'):(c.ai.success?'ai':'neither');
    const outcomeOptions=[outcomes.find(o=>o[0]===outcome),...outcomes.filter(o=>o[0]!==outcome).slice(0,2)].map(([value,text])=>({value,text}));
    outcomeOptions.push(outcomeOptions.shift());
    const labels=['加热','保持','降温'],actionKey=c.actions.join('-'),sets=[[0],[1],[2],[0,1],[0,2],[1,2],[0,1,2]];
    const actionOptions=[...sets.filter(a=>a.join('-')!==actionKey).slice(0,2),c.actions].map(a=>({value:a.join('-'),text:a.map(i=>labels[i]).join('、')+'。'}));
    return [
      {id:'final-outcome-v1',name:'concept',title:'最初手动和最后AI独立试烧，实际结果是哪一种？',correct:outcome,options:outcomeOptions,explanation:c.observation+'记录失败同样是完成实验。'},
      {id:'final-actions-v1',name:'concept-actions',title:'这次AI独立试烧，实际用过哪些动作？',correct:actionKey,options:actionOptions,explanation:`本窑真实轨迹记录了${c.actions.map(i=>labels[i]).join('、')}，不是按示范名称猜测。`},
      {id:'final-decision-v1',name:'concept-policy',title:`这次AI看到${c.decision.temperatureCelsius}℃、烧成进度${c.decision.maturity}/3时，关键操作是什么？`,correct:String(c.decision.action),options:labels.map((text,i)=>({value:String(i),text:text+'。'})),explanation:`对照本窑轨迹，这一步选择了${c.decision.actionText}，动作由学到的Q表决定。`},
      {id:'final-learning-v1',name:'concept-comparison',title:'最后这窑由AI自己控制，它怎样学会选择动作？',correct:'experience',options:[{value:'experience',text:'参考所选组合的经验，再通过自主试错和反馈调整动作价值。'},{value:'copy',text:'直接复制我最初点击按钮的时间顺序。'},{value:'percent',text:'按组合名称事先设置好合格率，再播放成功动画。'}],explanation:`本窑采用“${c.policy.names.join('、')}”组合训练后的Q表；学生的手动记录用于观察对照，不是训练输入。`},
      {id:'final-evidence-v1',name:'concept-retest',title:'依据这次手动与AI试烧的对照，怎样解释更合理？',correct:'observed',options:[{value:'always-ai',text:'只要AI这次烧好了，以后就一定都比人烧得好。'},{value:'observed',text:`${c.observation}单窑不代表稳定合格率，两个模型的能耗不能直接排名。`},{value:'always-manual',text:'只要AI这次没烧好，就说明示范和学习完全没有用。'}],explanation:'比较实际结果与操作方式，不用一次成败下结论；要比较稳定表现，需要同模型、同窑况的多次测试。'}
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
    const quizPoints = items.reduce((sum,item)=>sum+item.points,0), processPoints = processComplete ? 50 : 0;
    return {scoringVersion:'process50-quiz50-v1',processPoints,quizPoints,total:processPoints+quizPoints,maxPoints:100,
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
    const key=c?.key||null;if(comparisonKey===key)return false;
    comparisonKey=key;activeQuestions=comparisonQuestions(c);container.querySelectorAll('.quiz').forEach(field=>field.remove());mount(container);return true;
  }
  root.KilnQuiz={get questions(){return activeQuestions;},evaluate,readAnswers,mount,comparisonQuestions,useComparison};
  if(typeof module!=='undefined')module.exports=root.KilnQuiz;
})(typeof window!=='undefined'?window:globalThis);
