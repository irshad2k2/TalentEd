import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { lessonSchema, type LessonInput } from '@talented/shared';
import { ErrorBox, Field, Spinner } from '../components/ui';
import { VideoUploader } from '../components/VideoUploader';
import { api, errorMessage } from '../lib/api';
import { formatPrice } from '../lib/format';

interface ManagedLesson {
  id: string;
  title: string;
  content: string;
  videoKey: string | null;
  position: number;
}
interface ManagedCourse {
  id: string;
  title: string;
  description: string;
  category: string;
  pricePaise: number;
  published: boolean;
  lessons: ManagedLesson[];
  _count: { enrollments: number };
}

function LessonForm({
  courseId,
  lesson,
  onDone,
}: {
  courseId: string;
  lesson?: ManagedLesson;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<LessonInput>({
    resolver: zodResolver(lessonSchema),
    defaultValues: lesson
      ? { title: lesson.title, content: lesson.content, videoKey: lesson.videoKey }
      : { title: '', content: '', videoKey: null },
  });
  const save = useMutation({
    mutationFn: (values: LessonInput) =>
      lesson
        ? api.patch(`/api/courses/${courseId}/lessons/${lesson.id}`, values)
        : api.post(`/api/courses/${courseId}/lessons`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manage', courseId] });
      onDone();
    },
  });
  const videoKey = form.watch('videoKey');

  return (
    <form className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
      <Field label="Lesson title" error={form.formState.errors.title?.message}>
        <input className="input" {...form.register('title')} />
      </Field>
      <Field label="Content (Markdown). The AI tutor learns from this text." error={form.formState.errors.content?.message}>
        <textarea className="input min-h-48 font-mono" {...form.register('content')} />
      </Field>
      <div>
        <p className="label">Video (optional)</p>
        {videoKey && <p className="mb-2 text-xs text-green-700">✓ Video attached</p>}
        <VideoUploader onUploaded={(key) => form.setValue('videoKey', key, { shouldDirty: true })} />
      </div>
      {save.isError && <ErrorBox message={errorMessage(save.error)} />}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={save.isPending}>
          {lesson ? 'Save lesson' : 'Add lesson'}
        </button>
        <button type="button" className="btn-secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CourseEditorPage() {
  const { courseId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const [sharePassword, setSharePassword] = useState('');

  const course = useQuery({
    queryKey: ['manage', courseId],
    queryFn: async () => (await api.get<{ course: ManagedCourse }>(`/api/courses/${courseId}/manage`)).data.course,
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['manage', courseId] });
    queryClient.invalidateQueries({ queryKey: ['my-courses'] });
  };

  const publish = useMutation({
    mutationFn: (published: boolean) => api.post(`/api/courses/${courseId}/publish`, { published }),
    onSuccess: refresh,
    onError: (err) => setNotice(errorMessage(err)),
  });
  const removeLesson = useMutation({
    mutationFn: (lessonId: string) => api.delete(`/api/courses/${courseId}/lessons/${lessonId}`),
    onSuccess: refresh,
  });
  const generateQuiz = useMutation({
    mutationFn: async (lessonId: string) =>
      (await api.post<{ quiz: { questions: unknown[] } }>(`/api/courses/${courseId}/quizzes/generate`, { lessonId, count: 5 })).data,
    onSuccess: (data) => setNotice(`Quiz created with ${data.quiz.questions.length} questions.`),
    onError: (err) => setNotice(errorMessage(err)),
  });
  const share = useMutation({
    mutationFn: async () =>
      (await api.post<{ url: string }>(`/api/courses/${courseId}/share`, { password: sharePassword, expiresInHours: 72 })).data,
    onSuccess: (data) => {
      navigator.clipboard?.writeText(data.url).catch(() => {});
      setNotice(`Share link (copied, valid 72 hours): ${data.url}`);
      setSharePassword('');
    },
    onError: (err) => setNotice(errorMessage(err)),
  });
  const deleteCourse = useMutation({
    mutationFn: () => api.delete(`/api/courses/${courseId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-courses'] });
      navigate('/educator');
    },
  });

  if (course.isLoading) return <Spinner label="Loading course" />;
  if (course.isError) return <ErrorBox message={errorMessage(course.error)} />;
  const c = course.data!;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/educator" className="text-sm text-slate-500 hover:text-brand-600">
            ← All courses
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{c.title}</h1>
          <p className="text-sm text-slate-500">
            {c.category} · {formatPrice(c.pricePaise)} · {c._count.enrollments} students ·{' '}
            {c.published ? <span className="text-green-700">Published</span> : <span className="text-amber-700">Draft</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/courses/${c.id}`} className="btn-secondary">
            View as student
          </Link>
          <button className="btn-primary" disabled={publish.isPending} onClick={() => publish.mutate(!c.published)}>
            {c.published ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </div>

      {notice && (
        <div className="flex items-start justify-between gap-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
          <span className="break-all">{notice}</span>
          <button onClick={() => setNotice('')}>✕</button>
        </div>
      )}

      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Lessons</h2>
          {editing !== 'new' && (
            <button className="btn-secondary" onClick={() => setEditing('new')}>
              Add lesson
            </button>
          )}
        </div>
        <div className="space-y-3">
          {c.lessons.map((l, i) =>
            editing === l.id ? (
              <LessonForm key={l.id} courseId={c.id} lesson={l} onDone={() => setEditing(null)} />
            ) : (
              <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-4 py-3">
                <span className="text-sm text-slate-400">{i + 1}</span>
                <span className="flex-1 font-medium">{l.title}</span>
                {l.videoKey && <span className="text-xs text-slate-400">video</span>}
                <button className="text-sm text-brand-600" disabled={generateQuiz.isPending} onClick={() => generateQuiz.mutate(l.id)}>
                  {generateQuiz.isPending && generateQuiz.variables === l.id ? 'Generating...' : 'Generate quiz'}
                </button>
                <button className="text-sm text-slate-600" onClick={() => setEditing(l.id)}>
                  Edit
                </button>
                <button
                  className="text-sm text-red-600"
                  onClick={() => confirm(`Delete "${l.title}"?`) && removeLesson.mutate(l.id)}
                >
                  Delete
                </button>
              </div>
            ),
          )}
          {editing === 'new' && <LessonForm courseId={c.id} onDone={() => setEditing(null)} />}
          {c.lessons.length === 0 && editing !== 'new' && (
            <p className="text-sm text-slate-500">No lessons yet. Add one to publish this course.</p>
          )}
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Share a private preview</h2>
        <p className="text-sm text-slate-500">Anyone with the link and password can preview this course, even as a draft.</p>
        <div className="flex max-w-md gap-2">
          <input
            className="input"
            type="password"
            placeholder="Choose a password (min 4 characters)"
            value={sharePassword}
            onChange={(e) => setSharePassword(e.target.value)}
          />
          <button className="btn-secondary" disabled={sharePassword.length < 4 || share.isPending} onClick={() => share.mutate()}>
            Create link
          </button>
        </div>
      </section>

      <section className="card border-red-200 p-5">
        <h2 className="font-semibold text-red-700">Danger zone</h2>
        <button
          className="btn-danger mt-3"
          onClick={() => confirm('Delete this course and all its lessons? This cannot be undone.') && deleteCourse.mutate()}
        >
          Delete course
        </button>
      </section>
    </div>
  );
}
