import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ErrorBox, Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';

interface Quiz {
  id: string;
  courseId: string;
  title: string;
  questions: { question: string; options: string[] }[];
}
interface Result {
  score: number;
  total: number;
  results: { correct: boolean; answerIndex: number; explanation: string | null }[];
}

export function QuizPage() {
  const { quizId = '' } = useParams();
  const [answers, setAnswers] = useState<number[]>([]);

  const quiz = useQuery({
    queryKey: ['quiz', quizId],
    queryFn: async () => (await api.get<{ quiz: Quiz }>(`/api/quizzes/${quizId}`)).data.quiz,
  });
  const submit = useMutation({
    mutationFn: async () => (await api.post<Result>(`/api/quizzes/${quizId}/submit`, { answers })).data,
  });

  if (quiz.isLoading) return <Spinner label="Loading quiz" />;
  if (quiz.isError) return <ErrorBox message={errorMessage(quiz.error)} />;
  const q = quiz.data!;
  const result = submit.data;
  const allAnswered = q.questions.every((_, i) => answers[i] !== undefined);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link to={`/courses/${q.courseId}`} className="text-sm text-slate-500 hover:text-brand-600">
        ← Back to course
      </Link>
      <h1 className="text-2xl font-bold">{q.title}</h1>
      {result && (
        <div className="card bg-brand-50 p-5 text-center">
          <p className="text-3xl font-bold text-brand-700">
            {result.score} / {result.total}
          </p>
          <button
            className="btn-secondary mt-3"
            onClick={() => {
              setAnswers([]);
              submit.reset();
            }}
          >
            Try again
          </button>
        </div>
      )}
      {q.questions.map((question, i) => {
        const r = result?.results[i];
        return (
          <fieldset key={i} className="card p-5">
            <legend className="sr-only">Question {i + 1}</legend>
            <p className="mb-3 font-medium">
              {i + 1}. {question.question}
            </p>
            <div className="space-y-2">
              {question.options.map((opt, j) => {
                const chosen = answers[i] === j;
                const style = r
                  ? j === r.answerIndex
                    ? 'border-green-500 bg-green-50'
                    : chosen
                      ? 'border-red-400 bg-red-50'
                      : 'border-slate-200'
                  : chosen
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-slate-200 hover:border-slate-300';
                return (
                  <label key={j} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${style}`}>
                    <input
                      type="radio"
                      name={`q${i}`}
                      checked={chosen}
                      disabled={Boolean(result)}
                      onChange={() => setAnswers((a) => Object.assign([...a], { [i]: j }))}
                    />
                    {opt}
                  </label>
                );
              })}
            </div>
            {r?.explanation && <p className="mt-3 text-sm text-slate-600">{r.explanation}</p>}
          </fieldset>
        );
      })}
      {!result && (
        <button className="btn-primary w-full" disabled={!allAnswered || submit.isPending} onClick={() => submit.mutate()}>
          {submit.isPending ? 'Checking...' : 'Submit answers'}
        </button>
      )}
      {submit.isError && <ErrorBox message={errorMessage(submit.error)} />}
    </div>
  );
}
