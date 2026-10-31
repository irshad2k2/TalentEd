import { Link } from 'react-router-dom';
import type { CourseCardData } from '../lib/graphql';
import { formatPrice } from '../lib/format';
import { ProgressBar } from './ui';

export function CourseCard({ course, to }: { course: CourseCardData; to?: string }) {
  return (
    <Link
      to={to ?? `/courses/${course.id}`}
      className="card flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
          {course.category}
        </span>
        {!course.published && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Draft</span>
        )}
      </div>
      <h3 className="line-clamp-2 font-semibold text-slate-900">{course.title}</h3>
      <p className="mt-1 line-clamp-3 flex-1 text-sm text-slate-500">{course.description}</p>
      <p className="mt-3 text-xs text-slate-500">
        {course.educator.name} · {course.lessonCount} lessons · {course.enrollmentCount} students
      </p>
      {course.progressPercent !== null ? (
        <div className="mt-3">
          <ProgressBar percent={course.progressPercent} />
          <p className="mt-1 text-xs text-slate-500">{course.progressPercent}% complete</p>
        </div>
      ) : (
        <p className="mt-3 font-semibold text-slate-900">{formatPrice(course.pricePaise)}</p>
      )}
    </Link>
  );
}
