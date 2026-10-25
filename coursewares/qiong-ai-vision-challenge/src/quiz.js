export const QUIZ_VERSION = 'vision-knowledge-v2';
export const SCORING_TEXT = '对照实验30分 · 观察与解释20分 · 概念题50分（每题10分）';
export const QUIZ = [
  { id:'role', question:'本实验中，AI 主要帮助我们做什么？', options:[['change','改变照片，让文物变得更清楚'],['observe','根据可见特征描述器物，并给出判断依据'],['appraise','直接确定文物的年代和价格']], correct:'observe', explanation:'AI 帮助观察当前图片、提供判断和线索；资料查证与文物鉴定需要其他证据。' },
  { id:'control', question:'想研究遮挡对 AI 判断的影响，怎样操作更合适？', options:[['single','只改变遮挡，保留其他条件，再比较结果'],['many','同时遮挡、旋转和模糊，再比较结果'],['other','换一件文物，再比较两次结果']], correct:'single', explanation:'每次只改变一种条件，才能更清楚地观察它与 AI 判断变化的关系；结果也可能没有变化。' },
  { id:'boundary', question:'器物被完全遮住了，AI 怎样回答更合理？', options:[['background','根据背景颜色猜一个器物名称'],['highest','看不清也必须给出器物名称'],['outside','说明可见信息不足，无法判断']], correct:'outside', explanation:'器物不可见时缺少判断依据，AI 应说明信息不足，不能凭空补出器物特征。' },
  { id:'dating', question:'知识卡写着“唐代”，这个年代应依据什么？', options:[['looks','AI 看照片后的猜测'],['sources','可查证的文物资料、展签记录或考古研究'],['color','照片的颜色和清晰程度']], correct:'sources', explanation:'年代来自可查证资料。知识卡会标明来源；AI 仅凭一张照片不能给出可靠的准确断代。' },
  { id:'value', question:'怎样理解知识卡里的“文物价值”？', options:[['culture','结合资料，了解古人的生活、工艺和审美'],['price','让 AI 根据照片报出一个准确价格'],['trust','AI 解释得很详细，就可以直接相信']], correct:'culture', explanation:'这里介绍历史、文化和工艺意义，不提供市场估价；AI 的描述仍要对照图片和资料核对。' },
];
export const selectedOption = (q, answers={}) => q.options.find(([value]) => value === answers[q.id]);
export const answeredQuizCount = (answers={}) => QUIZ.filter(q=>selectedOption(q,answers)).length;
export const quizComplete = (answers={}) => answeredQuizCount(answers) === QUIZ.length;
export const quizResults = (answers={}) => QUIZ.map(q=>({id:q.id,question:q.question,selected:selectedOption(q,answers)?.[1]||'未作答',correctAnswer:q.options.find(([v])=>v===q.correct)[1],correct:answers[q.id]===q.correct,points:answers[q.id]===q.correct?10:0,explanation:q.explanation}));
