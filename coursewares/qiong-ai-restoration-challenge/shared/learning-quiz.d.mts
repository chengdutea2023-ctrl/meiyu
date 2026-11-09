type AssessmentAnswer = {
  title: string;
  question: string;
  options: Array<{ id: string; text: string }>;
  selected: string;
  selectedText: string;
  expected: string;
  expectedText: string;
  explanation: string;
  correct: boolean;
  points: number;
};

export function normalizeAssessment(value: unknown, proposalId?: string): { answers: AssessmentAnswer[] } | null;
export function assessmentAnswers(value: { answers: AssessmentAnswer[] }): Array<{ label: string; value: string }>;
