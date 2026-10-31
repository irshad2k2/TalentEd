import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { courseSchema, type CourseInput } from '@talented/shared';
import { CourseCard } from '../components/CourseCard';
import { EmptyState, ErrorBox, Field, Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { gql, MY_COURSES_QUERY, type CourseCardData } from '../lib/graphql';

export function EducatorDashboard() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);

  const courses = useQuery({
    queryKey: ['my-courses'],
    queryFn: () => gql<{ myCourses: CourseCardData[] }>(MY_COURSES_QUERY),
  });

  // Same schema as POST /api/courses on the server
  const form = useForm<CourseInput>({
    resolver: zodResolver(courseSchema),
    defaultValues: { pricePaise: 0, category: 'Programming' },
  });

  const create = useMutation({
    mutationFn: async (values: CourseInput) =>
      (await api.post<{ course: { id: string } }>('/api/courses', values)).data.course,
    onSuccess: (course) => navigate(`/educator/courses/${course.id}`),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your courses</h1>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : 'New course'}
        </button>
      </div>

      {showForm && (
        <form className="card grid gap-4 p-6 md:grid-cols-2" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
          <div className="md:col-span-2">
            <Field label="Title" error={form.formState.errors.title?.message}>
              <input className="input" {...form.register('title')} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Description" error={form.formState.errors.description?.message}>
              <textarea className="input min-h-24" {...form.register('description')} />
            </Field>
          </div>
          <Field label="Category" error={form.formState.errors.category?.message}>
            <input className="input" {...form.register('category')} />
          </Field>
          <Field label="Price in paise (0 = free, 49900 = ₹499)" error={form.formState.errors.pricePaise?.message}>
            <input className="input" type="number" min={0} {...form.register('pricePaise')} />
          </Field>
          {create.isError && (
            <div className="md:col-span-2">
              <ErrorBox message={errorMessage(create.error)} />
            </div>
          )}
          <div className="md:col-span-2">
            <button className="btn-primary" disabled={create.isPending}>
              Create course
            </button>
          </div>
        </form>
      )}

      {courses.isLoading && <Spinner />}
      {courses.isError && <ErrorBox message={errorMessage(courses.error)} />}
      {courses.data?.myCourses.length === 0 && <EmptyState title="Create your first course to get started" />}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {courses.data?.myCourses.map((c) => (
          <CourseCard key={c.id} course={{ ...c, progressPercent: null }} to={`/educator/courses/${c.id}`} />
        ))}
      </div>
    </div>
  );
}
