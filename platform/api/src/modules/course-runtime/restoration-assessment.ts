import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'fs';
import path from 'path';

type QuizDefinition = {
  version: string; workPoints: number; questionPoints: number; quizWeight: number;
  questions: Array<{ id: string; title: string; text: string; correctOption: string; options: Array<{ id: string; text: string }> }>;
};
const definition = JSON.parse(readFileSync(path.resolve(__dirname,
  '../../../../../coursewares/qiong-ai-restoration-challenge/shared/learning-quiz.json'), 'utf8')) as QuizDefinition;

export function gradeRestorationAssessment(value: unknown, proposalId: string) {
  const input = value as { version?: unknown; proposalId?: unknown; selections?: unknown } | null;
  const selections = input?.selections;
  if (!input || input.version !== definition.version || input.proposalId !== proposalId ||
      !Array.isArray(selections) || selections.length !== definition.questions.length ||
      selections.some((answer, i) => !definition.questions[i].options.some(option => option.id === answer))) {
    throw new BadRequestException('请先完成本课 5 道单选题，再提交作品');
  }
  const answers = definition.questions.map((question, i) => {
    const chosen = question.options.find(option => option.id === selections[i])!;
    const expected = question.options.find(option => option.id === question.correctOption)!;
    const correct = chosen.id === expected.id;
    return { questionId: question.id, title: question.title, question: question.text,
      options: question.options, selected: chosen.id, selectedText: chosen.text,
      expected: expected.id, expectedText: expected.text, correct,
      points: correct ? definition.questionPoints * definition.quizWeight : 0 };
  });
  const correctCount = answers.filter(answer => answer.correct).length;
  const quizScore = correctCount * definition.questionPoints;
  const quizPoints = quizScore * definition.quizWeight;
  return { version: definition.version, proposalId, selections, answers, questionCount: answers.length,
    correctCount, quizScore, quizPoints, quizWeight: definition.quizWeight,
    workPoints: definition.workPoints, totalScore: definition.workPoints + quizPoints };
}
export function restorationAssessmentSummary(grade: ReturnType<typeof gradeRestorationAssessment>) {
  return {
    restorationAssessment: grade, correctCount: grade.correctCount, questionCount: grade.questionCount,
    scoreText: `总分 ${grade.totalScore} 分（作品 ${grade.workPoints}/50，答题 ${grade.quizPoints}/50）`,
    answers: grade.answers.map((answer, i) => ({
      label: `第${i + 1}题 · ${answer.title}`,
      value: answer.question + '\n' + answer.options.map(option => option.id + '. ' + option.text).join('\n') + '\n我的答案：' + answer.selected + '. ' + answer.selectedText +
        '\n正确答案：' + answer.expected + '. ' + answer.expectedText +
        '\n' + (answer.correct ? '答对' : '答错') + ' · 计入总分 ' + answer.points + '/10 分',
    })),
  };
}
