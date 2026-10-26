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
    {id:'paired-demonstrations-v1', name:'concept-comparison', title:'怎样公平比较两套示范组合对学习的帮助？', correct:'paired-results', options:[
      {value:'energy-only',text:'只看演示的一窑有没有成功。'},
      {value:'different-tests',text:'给喜欢的组合更多练习和更容易的测试。'},
      {value:'paired-results',text:'使用相同练习量和测试窑况，比较学习变化、合格数量和能耗。'}], explanation:'只改变示范组合，保持反馈、练习量和测试条件一致，保留失败结果，才便于比较。'},
    {id:'similar-results-v1', name:'concept-retest', title:'两套组合最终合格率相同，能得出什么结论？', correct:'similar-policies', options:[
      {value:'similar-policies',text:'自主试错后可能学到了相近方法，还要看学习过程和能耗。'},
      {value:'no-learning',text:'说明AI没有学习，所有示范都没有用。'},
      {value:'set-percent',text:'应该修改显示数据，让两组看起来不同。'}], explanation:'相近的最终结果不代表经历相同，更不能人为改数。示范后的起点、自主练习后的变化和能耗都值得观察。'}
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
