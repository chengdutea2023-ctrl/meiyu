import React from 'react';
import { QUIZ_QUESTIONS, quizDraft, missingQuizQuestions } from '../shared/learning-quiz.mjs';

export default function LearningQuiz({ value, onChange, disabled }) {
  const answers = quizDraft(value);
  const missing = missingQuizQuestions(answers);
  return <section className="learning-quiz" aria-labelledby="learning-quiz-heading">
    <h2 id="learning-quiz-heading">本课小问答 · 提交前必答</h2>
    <p>5 道单选题，每题 20 分，答题成绩按 50% 计入总分。完成修复并成功提交作品得 50 分。</p>
    <p role="status">已回答 {5 - missing.length}/5 题{missing.length ? '，请完成第' + missing.join('、') + '题。' : '，可以提交作品。'}</p>
    {QUIZ_QUESTIONS.map((question, i) => <fieldset key={question.id} disabled={disabled}>
      <legend>第 {i + 1} 题 · {question.title}</legend>
      <p>{question.text}</p>
      {question.options.map(option => <label key={option.id}>
        <input type="radio" name={'learning-quiz-' + question.id} checked={answers[i] === option.id}
          onChange={() => onChange(answers.map((answer, index) => index === i ? option.id : answer))}/>
        <span>{option.id}. {option.text}</span>
      </label>)}
    </fieldset>)}
  </section>;
}
