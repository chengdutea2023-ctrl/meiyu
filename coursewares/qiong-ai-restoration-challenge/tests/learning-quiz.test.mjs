import test from 'node:test';
import assert from 'node:assert/strict';
import { QUIZ_QUESTIONS, gradeQuiz, quizDraft, normalizeAssessment } from '../shared/learning-quiz.mjs';
import { restoreProposalDraft } from '../shared/proposal-progress.mjs';
import { showcasePage } from '../shared/showcase.mjs';

test('five required answers grade to 50 completion points plus 0–50 quiz points', () => {
  const correct = QUIZ_QUESTIONS.map(question => question.correctOption);
  for (let count = 0; count <= 5; count++) {
    const answers = correct.map((answer, index) => index < count ? answer : answer === 'A' ? 'B' : 'A');
    const grade = gradeQuiz(answers, 'owned-proposal');
    assert.equal(grade.quizScore, count * 20);
    assert.equal(grade.quizPoints, count * 10);
    assert.equal(grade.totalScore, 50 + count * 10);
    assert.equal(grade.answers.length, 5);
    assert.equal(normalizeAssessment({...grade, totalScore:999}, grade.proposalId).totalScore, grade.totalScore);
    assert.equal(normalizeAssessment(grade, 'another-proposal'), null);
  }
  for (const answers of [undefined, [], ['A','B','C','D',null], ['A','B','C','D','E']]) assert.throws(() => gradeQuiz(answers, 'p'));
});
test('partial answers restore in progress, and projection explains correct and incorrect saved answers', () => {
  const draft = {version:2, ownerId:'owner', step:2, clueIds:[], proposalText:'方案', maskDataUrl:'', quizAnswers:['A',null,'C',null,null]};
  const restored = restoreProposalDraft(draft, {ownerId:'owner',resetVersion:0,proposals:[],assets:[]});
  assert.deepEqual(restored.quizAnswers,draft.quizAnswers);
  assert.deepEqual(quizDraft(undefined),[null,null,null,null,null]);
  const {version,proposalId,selections}=gradeQuiz(['A','B','C','D','B'],'owned');
  const html=showcasePage({proposalId,assessment:{version,proposalId,selections},clues:[]});
  assert.match(html,/总分 90 分/);
  assert.match(html,/作品 50\/50，答题 40\/50/);
  assert.equal((html.match(/答案解析：/g)||[]).length,5);
  for(const q of QUIZ_QUESTIONS){
    assert.ok(html.includes(q.text));
    assert.ok(q.explanation && html.includes(q.explanation));
  }
  assert.match(html,/我的答案：/);assert.match(html,/正确答案：/);
  assert.match(html,/答对 · 计入总分 10\/10 分/);
  assert.match(html,/答错 · 计入总分 0\/10 分/);
});
