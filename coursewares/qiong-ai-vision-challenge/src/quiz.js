export const QUIZ_VERSION = 'vision-observation-v3';
export const SCORING_TEXT = '对照实验30分 · 观察与解释20分 · 概念题50分（每题10分）';
export const QUIZ = [
  { id:'recording', question:'点击“让 AI 识别”后，怎样记录结果，才能了解 AI 是怎么判断的？', options:[['name','只记住它说的器物名称'],['evidence','记录它的判断、描述的特征，以及不能确定的地方'],['clicks','只记录自己点击了几次识别']], correct:'evidence', explanation:'不只看 AI 的结论，还要看它依据什么、哪些地方拿不准。' },
  { id:'rotation', question:'旋转图片后，AI 对同一件文物给出了不同的判断，哪种理解更合理？', options:[['object','文物本身变成了另一种器物'],['later','后一次判断一定比前一次准确'],['compare','图片呈现方式可能影响 AI 的判断，需要比较前后的依据']], correct:'compare', explanation:'文物没有改变，变化的是输入图片；AI 的判断仍需要核对。' },
  { id:'unchanged', question:'遮挡一部分后，AI 的判断没有变化，这次实验还有意义吗？', options:[['remaining','有意义，可以检查剩下的哪些特征仍支持它的判断'],['wrong','没有意义，必须让 AI 认错才算实验成功'],['skip','没有意义，说明 AI 没有重新看图']], correct:'remaining', explanation:'“没有变化”也是实验结果，可以继续比较 AI 的描述和依据。' },
  { id:'evidence', question:'AI 说“我看到了把手”，但当前图片中的把手已经被完全遮住，你应该怎么做？', options:[['through','相信 AI，它一定能看到被遮挡的部分'],['check','指出这条依据与当前图片不符，不能直接相信它的判断'],['accept','把 AI 说的“有把手”当作已经证实的事实']], correct:'check', explanation:'AI 的解释也可能出错，要检查它描述的特征是否真的可见。' },
  { id:'certainty', question:'图片已经模糊到难以看清，AI 仍给出了很详细、很肯定的介绍，这说明介绍可靠吗？', options:[['detail','可靠，介绍越详细就越准确'],['sure','可靠，表达肯定就说明证据充分'],['verify','不一定，仍要核对图片和资料；信息不足时应保留判断']], correct:'verify', explanation:'说得详细、流畅或肯定，都不能代替证据。' },
];
export const selectedOption = (q, answers={}) => q.options.find(([value]) => value === answers[q.id]);
export const answeredQuizCount = (answers={}) => QUIZ.filter(q=>selectedOption(q,answers)).length;
export const quizComplete = (answers={}) => answeredQuizCount(answers) === QUIZ.length;
const letter = index => String.fromCharCode(65+index);
export const quizResults = (answers={}) => QUIZ.map((q,i)=>{
  const options=q.options.map(([value,label],j)=>({value,label,letter:letter(j)}));
  const selected=options.find(o=>o.value===answers[q.id]), correct=options.find(o=>o.value===q.correct);
  return {id:q.id,questionNumber:i+1,question:q.question,options,selectedValue:selected?.value||'',selectedLetter:selected?.letter||'',selected:selected?selected.letter+'. '+selected.label:'未作答',correctValue:correct.value,correctLetter:correct.letter,correctAnswer:correct.letter+'. '+correct.label,correct:!!selected&&selected.value===q.correct,points:selected?.value===q.correct?10:0,explanation:q.explanation};
});
