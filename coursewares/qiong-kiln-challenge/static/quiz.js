(function (root) {
  'use strict';
  const questions = [
    {id:'reward-effects-v1', name:'concept', title:'为什么改变奖励后，AI可能改变烧窑方式？', correct:'learned', options:[
      {value:'fixed',text:'只要训练次数增加，AI就一定会更省电。'},
      {value:'learned',text:'奖励重点变了，AI通过试错学到的操作选择也可能改变。'},
      {value:'perfect',text:'选择“优先节能”后，系统直接关闭了加热功能。'}], explanation:'奖励告诉AI哪些结果更值得争取，会影响它通过试错学到的选择。'},
    {id:'kiln-actions-v1', name:'concept-actions', title:'本课件中，AI可以选择哪些烧窑动作？', correct:'heat-hold-cool', options:[
      {value:'heat-hold-cool',text:'加热、保持、降温。'},
      {value:'choose-score',text:'直接选择本次实验的合格率。'},
      {value:'change-report',text:'删除失败记录、修改报告分数。'}], explanation:'AI选择的是加热、保持或降温；合格率来自实际测试结果。'},
    {id:'learned-policy-v1', name:'concept-policy', title:'AI通过反复试烧和反馈，主要学到什么？', correct:'state-actions', options:[
      {value:'real-recipe',text:'所有真实窑炉都适用的烧制配方。'},
      {value:'state-actions',text:'不同窑炉状态下，哪些动作更值得选择。'},
      {value:'fixed-repeat',text:'无论温度怎样，都重复同一个动作。'}], explanation:'它根据模拟窑炉状态和反馈，学习不同动作的价值，不是真实烧制配方。'},
    {id:'energy-comparison-v2', name:'concept-comparison', title:'怎样判断“优先烧好”和“优先节能”哪种更合适？', correct:'paired-results', options:[
      {value:'energy-only',text:'只选每窑能耗最低的，不看能否烧成。'},
      {value:'always-worse',text:'节能一定更容易失败，不需要测试。'},
      {value:'paired-results',text:'在相同窑况下，同时比较合格数量和能耗，再判断取舍。'}], explanation:'要控制测试条件、保留失败记录，同时看合格数量与能耗；节能并不必然降低合格率，100%也不保证永远成功。'},
    {id:'retest-learning-v1', name:'concept-retest', title:'一次训练结果不理想，更合理的做法是什么？', correct:'adjust-retest', options:[
      {value:'adjust-retest',text:'检查奖励设置，调整后在相同测试条件下重新比较。'},
      {value:'hide-failures',text:'只保留成功的试烧，隐藏失败结果。'},
      {value:'set-percent',text:'直接把显示的合格率改成100%。'}], explanation:'保留真实结果，检查奖励并控制测试条件，才能判断调整有没有作用。'}
  ];
  function evaluate(answers, processComplete) {
    const items = questions.map(q => {
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
    return Object.fromEntries(questions.map(q=>[q.id,document.querySelector(`[name="${q.name}"]:checked`)?.value||'']));
  }
  function mount(container) {
    for (const [index,q] of questions.entries()) {
      const field = document.createElement('fieldset'); field.className='quiz'; field.dataset.questionId=q.id;
      const legend=document.createElement('legend');legend.textContent=`${index+1}. ${q.title}（10分）`;field.append(legend);
      for (const option of q.options) {
        const label=document.createElement('label'),input=document.createElement('input');input.type='radio';input.name=q.name;input.value=option.value;
        label.append(input,document.createTextNode(option.text));field.append(label);
      }
      container.append(field);
    }
  }
  root.KilnQuiz={questions,evaluate,readAnswers,mount};
  if(typeof module!=='undefined')module.exports=root.KilnQuiz;
})(typeof window!=='undefined'?window:globalThis);
