/**
 * Tiny GraphQL client on top of the same axios instance (so it gets the token + retry logic).
 * A full client like Apollo Client would add a normalized cache; TanStack Query already caches here.
 */
import { api } from './api';

export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await api.post<{ data?: T; errors?: { message: string }[] }>('/graphql', { query, variables });
  if (res.data.errors?.length) throw new Error(res.data.errors[0].message);
  return res.data.data as T;
}

// ---------- shared types for GraphQL results ----------
export interface CourseCardData {
  id: string;
  title: string;
  description: string;
  category: string;
  pricePaise: number;
  lessonCount: number;
  enrollmentCount: number;
  educator: { name: string };
  isEnrolled: boolean;
  progressPercent: number | null;
  published: boolean;
}

export interface CourseDetailData extends CourseCardData {
  isOwner: boolean;
  lessons: { id: string; title: string; position: number; hasVideo: boolean; completed: boolean }[];
}

const CARD_FIELDS = `
  id title description category pricePaise lessonCount enrollmentCount published
  isEnrolled progressPercent
  educator { name }
`;

export const COURSES_QUERY = `
  query Courses($first: Int, $after: String, $category: String, $search: String) {
    courses(first: $first, after: $after, category: $category, search: $search) {
      items { ${CARD_FIELDS} }
      nextCursor
    }
  }
`;

export const COURSE_QUERY = `
  query Course($id: ID!) {
    course(id: $id) {
      ${CARD_FIELDS}
      isOwner
      lessons { id title position hasVideo completed }
    }
  }
`;

export const CATEGORIES_QUERY = `query { categories }`;
export const MY_ENROLLMENTS_QUERY = `query { myEnrollments { ${CARD_FIELDS} } }`;
export const MY_COURSES_QUERY = `query { myCourses { ${CARD_FIELDS} } }`;
