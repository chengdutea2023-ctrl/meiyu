import definition from './learning-quiz.json' with { type: 'json' };

export const QUIZ_VERSION = definition.version;
export const QUIZ_QUESTIONS = definition.questions;

export function quizDraft(value) {
  if (value === undefined) return QUIZ_QUESTIONS.map(() => null);
  if (!Array.isArray(value) || value.length !== QUIZ_QUESTIONS.length ||
      value.some((answer, i) => answer !== null && !QUIZ_QUESTIONS[i].options.some(option => option.id === answer))) {
    throw Error('答题记录无法读取，请重新选择答案');
  }
  return [...value];
}
export function missingQuizQuestions(value) {
  return quizDraft(value).flatMap((answer, i) => answer === null ? [i + 1] : []);
}
export function gradeQuiz(value, proposalId) {
  const selections = quizDraft(value);
  const missing = missingQuizQuestions(selections);
  if (missing.length) throw Error('请先回答第' + missing.join('、') + '题，再提交作品');
  const answers = QUIZ_QUESTIONS.map((question, i) => {
    const chosen = question.options.find(option => option.id === selections[i]);
    const expected = question.options.find(option => option.id === question.correctOption);
    const correct = chosen.id === expected.id;
    return { questionId: question.id, title: question.title, question: question.text,
      options: question.options, selected: chosen.id, selectedText: chosen.text,
      expected: expected.id, expectedText: expected.text, correct,
      points: correct ? definition.questionPoints * definition.quizWeight : 0 };
  });
  const correctCount = answers.filter(answer => answer.correct).length;
  const quizScore = correctCount * definition.questionPoints;
  const quizPoints = quizScore * definition.quizWeight;
  return { version: QUIZ_VERSION, proposalId, selections, answers, questionCount: answers.length,
    correctCount, quizScore, quizPoints, quizWeight: definition.quizWeight,
    workPoints: definition.workPoints, totalScore: definition.workPoints + quizPoints };
}
export function normalizeAssessment(value, proposalId) {
  if (!value || value.version !== QUIZ_VERSION || typeof value.proposalId !== 'string' || !value.proposalId || value.proposalId.length > 80 ||
      proposalId && value.proposalId !== proposalId) return null;
  try { return gradeQuiz(value.selections, value.proposalId); } catch { return null; }
}
export function assessmentScoreText(value) {
  return '总分 ' + value.totalScore + ' 分（作品 ' + value.workPoints + '/50，答题 ' + value.quizPoints + '/50）';
}
export function assessmentAnswers(value) {
  return value.answers.map((answer, i) => ({
    label: '第' + (i + 1) + '题 · ' + answer.title,
    value: answer.question + '\n' + answer.options.map(option => option.id + '. ' + option.text).join('\n') + '\n我的答案：' + answer.selected + '. ' + answer.selectedText +
      '\n正确答案：' + answer.expected + '. ' + answer.expectedText +
      '\n' + (answer.correct ? '答对' : '答错') + ' · 计入总分 ' + answer.points + '/10 分',
  }));
}
