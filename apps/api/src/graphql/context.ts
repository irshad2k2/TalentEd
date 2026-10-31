/**
 * Per-request GraphQL context: the signed-in user (or null) and DataLoaders.
 *
 * Why DataLoader: a catalog page with 12 courses would otherwise run 12 separate
 * "is this user enrolled?" queries (the N+1 problem). DataLoader collects all 12 ids
 * requested in the same tick and runs ONE query with `IN (...)`.
 */
import DataLoader from 'dataloader';
import type { Request } from 'express';
import { prisma } from '../config/db';
import { userFromHeader, type AuthUser } from '../middleware/auth';

export interface GqlContext {
  user: AuthUser | null;
  loaders: ReturnType<typeof makeLoaders>;
}

function makeLoaders(user: AuthUser | null) {
  return {
    /** courseId -> is the current user enrolled? */
    enrolled: new DataLoader<string, boolean>(async (courseIds) => {
      if (!user) return courseIds.map(() => false);
      const rows = await prisma.enrollment.findMany({
        where: { userId: user.id, courseId: { in: [...courseIds] } },
        select: { courseId: true },
      });
      const set = new Set(rows.map((r) => r.courseId));
      return courseIds.map((id) => set.has(id));
    }),

    /** courseId -> set of lesson ids the current user completed */
    completedLessons: new DataLoader<string, Set<string>>(async (courseIds) => {
      if (!user) return courseIds.map(() => new Set<string>());
      const rows = await prisma.lessonProgress.findMany({
        where: { userId: user.id, lesson: { courseId: { in: [...courseIds] } } },
        select: { lessonId: true, lesson: { select: { courseId: true } } },
      });
      return courseIds.map(
        (cid) => new Set(rows.filter((r) => r.lesson.courseId === cid).map((r) => r.lessonId)),
      );
    }),
  };
}

export async function buildContext({ req }: { req: Request }): Promise<GqlContext> {
  const user = userFromHeader(req.headers.authorization);
  return { user, loaders: makeLoaders(user) };
}
