import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { CourseCard } from '../components/CourseCard';
import { EmptyState, ErrorBox, Spinner } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { CATEGORIES_QUERY, COURSES_QUERY, gql, type CourseCardData } from '../lib/graphql';

interface Page {
  courses: { items: CourseCardData[]; nextCursor: string | null };
}
interface SearchResult {
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  snippet: string;
}

export function CatalogPage() {
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [semanticQ, setSemanticQ] = useState('');

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => gql<{ categories: string[] }>(CATEGORIES_QUERY),
  });

  // Infinite scroll: each page passes the previous page's nextCursor as `after`.
  const courses = useInfiniteQuery({
    queryKey: ['courses', category],
    queryFn: ({ pageParam }) => gql<Page>(COURSES_QUERY, { first: 9, after: pageParam, category }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.courses.nextCursor,
  });

  const search = useQuery({
    queryKey: ['semantic-search', semanticQ],
    queryFn: async () =>
      (await api.get<{ results: SearchResult[] }>('/api/ai/search', { params: { q: semanticQ } })).data.results,
    enabled: semanticQ.length >= 2,
  });

  // Load the next page when the sentinel div scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = courses;
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && hasNextPage && !isFetchingNextPage && fetchNextPage(),
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = courses.data?.pages.flatMap((p) => p.courses.items) ?? [];

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 px-8 py-10 text-white">
        <h1 className="text-3xl font-bold">Learn with an AI tutor that knows your course</h1>
        <p className="mt-2 max-w-2xl text-brand-100">
          Search by meaning, not keywords. Try "how do I wait for an API call to finish".
        </p>
        <form
          className="mt-5 flex max-w-xl gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setSemanticQ(query.trim());
          }}
        >
          <input
            className="input text-slate-900"
            placeholder="What do you want to learn?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn bg-white text-brand-700 hover:bg-brand-50">Search</button>
        </form>
      </section>

      {semanticQ && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Lessons matching "{semanticQ}"</h2>
            <button className="text-sm text-slate-500 underline" onClick={() => setSemanticQ('')}>
              Clear
            </button>
          </div>
          {search.isLoading && <Spinner label="Searching" />}
          {search.isError && <ErrorBox message={errorMessage(search.error)} />}
          {search.data?.length === 0 && <EmptyState title="No lessons match that yet" />}
          <div className="grid gap-3 md:grid-cols-2">
            {search.data?.map((r) => (
              <Link key={r.lessonId} to={`/courses/${r.courseId}`} className="card p-4 hover:border-brand-500">
                <p className="text-xs text-slate-500">{r.courseTitle}</p>
                <p className="font-medium">{r.lessonTitle}</p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">{r.snippet}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex flex-wrap gap-2">
          {[null, ...(categories.data?.categories ?? [])].map((c) => (
            <button
              key={c ?? 'all'}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1 text-sm ${
                category === c ? 'bg-brand-600 text-white' : 'border border-slate-300 bg-white text-slate-600'
              }`}
            >
              {c ?? 'All'}
            </button>
          ))}
        </div>

        {courses.isLoading && <Spinner label="Loading courses" />}
        {courses.isError && <ErrorBox message={errorMessage(courses.error)} onRetry={() => courses.refetch()} />}
        {courses.isSuccess && items.length === 0 && <EmptyState title="No courses yet" />}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
        <div ref={sentinel} />
        {isFetchingNextPage && <Spinner label="Loading more" />}
      </section>
    </div>
  );
}
