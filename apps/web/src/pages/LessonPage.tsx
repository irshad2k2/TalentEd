import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TutorPanel } from '../components/TutorPanel';
import { ErrorBox, Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';

interface LessonResponse {
  lesson: { id: string; title: string; content: string; videoUrl: string | null; completed: boolean };
  prevId: string | null;
  nextId: string | null;
}

export function LessonPage() {
  const { courseId = '', lessonId = '' } = useParams();
  const queryClient = useQueryClient();

  const lesson = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: async () => (await api.get<LessonResponse>(`/api/courses/${courseId}/lessons/${lessonId}`)).data,
  });

  const complete = useMutation({
    mutationFn: () => api.post(`/api/courses/${courseId}/lessons/${lessonId}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lesson', lessonId] });
      queryClient.invalidateQueries({ queryKey: ['course', courseId] });
      queryClient.invalidateQueries({ queryKey: ['my-enrollments'] });
    },
  });

  if (lesson.isLoading) return <Spinner label="Loading lesson" />;
  if (lesson.isError) return <ErrorBox message={errorMessage(lesson.error)} />;
  const { lesson: l, prevId, nextId } = lesson.data!;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <article className="space-y-5 lg:col-span-2">
        <Link to={`/courses/${courseId}`} className="text-sm text-slate-500 hover:text-brand-600">
          ← Back to course
        </Link>
        <h1 className="text-2xl font-bold">{l.title}</h1>
        {l.videoUrl && (
          <video controls className="aspect-video w-full rounded-xl bg-black" src={l.videoUrl} preload="metadata" />
        )}
        <div className="card prose-lesson p-6">
          <ReactMarkdown>{l.content}</ReactMarkdown>
        </div>
        <div className="flex items-center justify-between">
          {prevId ? (
            <Link to={`/courses/${courseId}/lessons/${prevId}`} className="btn-secondary">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <button
            className={l.completed ? 'btn-secondary' : 'btn-primary'}
            disabled={l.completed || complete.isPending}
            onClick={() => complete.mutate()}
          >
            {l.completed ? '✓ Completed' : 'Mark as complete'}
          </button>
          {nextId ? (
            <Link to={`/courses/${courseId}/lessons/${nextId}`} className="btn-secondary">
              Next
            </Link>
          ) : (
            <span />
          )}
        </div>
      </article>
      <TutorPanel courseId={courseId} />
    </div>
  );
}
