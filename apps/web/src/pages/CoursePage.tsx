import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorBox, ProgressBar, Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatPrice } from '../lib/format';
import { COURSE_QUERY, gql, type CourseDetailData } from '../lib/graphql';
import { payForCourse } from '../lib/razorpay';

interface QuizSummary {
  id: string;
  title: string;
  questionCount: number;
  bestScore: number | null;
}

export function CoursePage() {
  const { courseId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState('');

  const course = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => gql<{ course: CourseDetailData | null }>(COURSE_QUERY, { id: courseId }),
  });
  const c = course.data?.course;
  const canView = Boolean(c && (c.isEnrolled || c.isOwner));

  const quizzes = useQuery({
    queryKey: ['quizzes', courseId],
    queryFn: async () => (await api.get<{ quizzes: QuizSummary[] }>(`/api/courses/${courseId}/quizzes`)).data.quizzes,
    enabled: canView,
  });

  const enroll = useMutation({
    mutationFn: async () => {
      if (!user) return navigate('/login', { state: { from: `/courses/${courseId}` } });
      if (c!.pricePaise > 0) await payForCourse(courseId, user);
      else await api.post(`/api/courses/${courseId}/enroll`);
    },
    onSuccess: () => {
      setActionError('');
      queryClient.invalidateQueries({ queryKey: ['course', courseId] });
      queryClient.invalidateQueries({ queryKey: ['my-enrollments'] });
    },
    onError: (err) => setActionError(errorMessage(err)),
  });

  if (course.isLoading) return <Spinner label="Loading course" />;
  if (course.isError) return <ErrorBox message={errorMessage(course.error)} onRetry={() => course.refetch()} />;
  if (!c) return <EmptyState title="Course not found" />;

  const firstLesson = c.lessons.find((l) => !l.completed) ?? c.lessons[0];

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div>
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">{c.category}</span>
          <h1 className="mt-3 text-3xl font-bold">{c.title}</h1>
          <p className="mt-3 whitespace-pre-line text-slate-600">{c.description}</p>
          <p className="mt-3 text-sm text-slate-500">
            By {c.educator.name} · {c.lessonCount} lessons · {c.enrollmentCount} students
          </p>
        </div>

        <div className="card divide-y divide-slate-100">
          <h2 className="px-5 py-3 font-semibold">Lessons</h2>
          {c.lessons.map((l, i) => (
            <div key={l.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${l.completed ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                {l.completed ? '✓' : i + 1}
              </span>
              {canView ? (
                <Link to={`/courses/${c.id}/lessons/${l.id}`} className="flex-1 hover:text-brand-600">
                  {l.title}
                </Link>
              ) : (
                <span className="flex-1 text-slate-700">{l.title}</span>
              )}
              {l.hasVideo && <span className="text-xs text-slate-400">video</span>}
            </div>
          ))}
        </div>

        {canView && (
          <div className="card p-5">
            <h2 className="mb-3 font-semibold">Quizzes</h2>
            {quizzes.data?.length === 0 && <p className="text-sm text-slate-500">No quizzes yet.</p>}
            <div className="space-y-2">
              {quizzes.data?.map((q) => (
                <Link key={q.id} to={`/quizzes/${q.id}`} className="flex justify-between rounded-lg border border-slate-200 px-4 py-3 text-sm hover:border-brand-500">
                  <span>{q.title}</span>
                  <span className="text-slate-500">
                    {q.bestScore !== null ? `Best: ${q.bestScore}/${q.questionCount}` : `${q.questionCount} questions`}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <aside className="card h-fit space-y-4 p-6">
        {c.isOwner ? (
          <>
            <p className="text-sm text-slate-500">You teach this course.</p>
            <Link to={`/educator/courses/${c.id}`} className="btn-primary w-full">
              Edit course
            </Link>
          </>
        ) : c.isEnrolled ? (
          <>
            <ProgressBar percent={c.progressPercent ?? 0} />
            <p className="text-sm text-slate-500">{c.progressPercent ?? 0}% complete</p>
            {firstLesson && (
              <Link to={`/courses/${c.id}/lessons/${firstLesson.id}`} className="btn-primary w-full">
                {c.progressPercent ? 'Continue learning' : 'Start learning'}
              </Link>
            )}
          </>
        ) : (
          <>
            <p className="text-3xl font-bold">{formatPrice(c.pricePaise)}</p>
            <button className="btn-primary w-full" disabled={enroll.isPending} onClick={() => enroll.mutate()}>
              {enroll.isPending ? 'Please wait...' : c.pricePaise > 0 ? 'Buy course' : 'Enroll for free'}
            </button>
            {c.pricePaise > 0 && (
              <p className="text-xs text-slate-500">Test mode: use Razorpay's test card or UPI id success@razorpay.</p>
            )}
          </>
        )}
        {actionError && <ErrorBox message={actionError} />}
      </aside>
    </div>
  );
}
