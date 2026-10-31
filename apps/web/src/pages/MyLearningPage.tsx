import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CourseCard } from '../components/CourseCard';
import { EmptyState, ErrorBox, Spinner } from '../components/ui';
import { errorMessage } from '../lib/api';
import { gql, MY_ENROLLMENTS_QUERY, type CourseCardData } from '../lib/graphql';

export function MyLearningPage() {
  const q = useQuery({
    queryKey: ['my-enrollments'],
    queryFn: () => gql<{ myEnrollments: CourseCardData[] }>(MY_ENROLLMENTS_QUERY),
  });

  if (q.isLoading) return <Spinner label="Loading your courses" />;
  if (q.isError) return <ErrorBox message={errorMessage(q.error)} onRetry={() => q.refetch()} />;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">My learning</h1>
      {q.data!.myEnrollments.length === 0 ? (
        <EmptyState title="You haven't enrolled in any course yet">
          <Link to="/" className="btn-primary">
            Browse courses
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {q.data!.myEnrollments.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      )}
    </div>
  );
}
