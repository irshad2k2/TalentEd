import { GraphQLError } from 'graphql';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import type { GqlContext } from './context';

/** What every Course query loads, so field resolvers don't need extra queries. */
const courseInclude = {
  educator: { select: { id: true, name: true } },
  _count: { select: { lessons: true, enrollments: true } },
} satisfies Prisma.CourseInclude;

type CourseRow = Prisma.CourseGetPayload<{ include: typeof courseInclude }>;

const requireUser = (ctx: GqlContext) => {
  if (!ctx.user) throw new GraphQLError('Authentication required', { extensions: { code: 'UNAUTHENTICATED' } });
  return ctx.user;
};

export const resolvers = {
  Query: {
    /**
     * Cursor pagination. Offset pagination (page=3) skips or repeats rows when new courses are
     * added between page loads; a cursor ("everything after id X") stays correct.
     */
    courses: async (
      _: unknown,
      args: { first: number; after?: string | null; category?: string | null; search?: string | null },
    ) => {
      const take = Math.min(Math.max(args.first, 1), 50);
      const where: Prisma.CourseWhereInput = {
        published: true,
        ...(args.category ? { category: args.category } : {}),
        ...(args.search ? { title: { contains: args.search } } : {}),
      };
      // Fetch one extra row to learn whether another page exists.
      const rows = await prisma.course.findMany({
        where,
        include: courseInclude,
        orderBy: { id: 'desc' },
        take: take + 1,
        ...(args.after ? { cursor: { id: args.after }, skip: 1 } : {}),
      });
      const hasMore = rows.length > take;
      const items = hasMore ? rows.slice(0, take) : rows;
      return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
    },

    /** Published courses are public; drafts only exist for their owner (null for everyone else). */
    course: async (_: unknown, { id }: { id: string }, ctx: GqlContext) => {
      const course = await prisma.course.findUnique({ where: { id }, include: courseInclude });
      if (!course) return null;
      if (!course.published && course.educatorId !== ctx.user?.id) return null;
      return course;
    },

    categories: async () => {
      const rows = await prisma.course.findMany({
        where: { published: true },
        distinct: ['category'],
        select: { category: true },
        orderBy: { category: 'asc' },
      });
      return rows.map((r) => r.category);
    },

    myEnrollments: async (_: unknown, __: unknown, ctx: GqlContext) => {
      const user = requireUser(ctx);
      const rows = await prisma.enrollment.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        include: { course: { include: courseInclude } },
      });
      return rows.map((r) => r.course);
    },

    myCourses: async (_: unknown, __: unknown, ctx: GqlContext) => {
      const user = requireUser(ctx);
      return prisma.course.findMany({
        where: { educatorId: user.id },
        include: courseInclude,
        orderBy: { createdAt: 'desc' },
      });
    },
  },

  Course: {
    lessonCount: (c: CourseRow) => c._count.lessons,
    enrollmentCount: (c: CourseRow) => c._count.enrollments,
    isOwner: (c: CourseRow, _: unknown, ctx: GqlContext) => c.educatorId === ctx.user?.id,
    isEnrolled: (c: CourseRow, _: unknown, ctx: GqlContext) => ctx.loaders.enrolled.load(c.id),

    lessons: async (c: CourseRow, _: unknown, ctx: GqlContext) => {
      const [lessons, done] = await Promise.all([
        prisma.lesson.findMany({
          where: { courseId: c.id },
          orderBy: { position: 'asc' },
          select: { id: true, title: true, position: true, videoKey: true },
        }),
        ctx.loaders.completedLessons.load(c.id),
      ]);
      return lessons.map((l) => ({
        id: l.id,
        title: l.title,
        position: l.position,
        hasVideo: Boolean(l.videoKey),
        completed: done.has(l.id),
      }));
    },

    progressPercent: async (c: CourseRow, _: unknown, ctx: GqlContext) => {
      if (!ctx.user || !(await ctx.loaders.enrolled.load(c.id))) return null;
      const done = await ctx.loaders.completedLessons.load(c.id);
      return c._count.lessons ? Math.round((done.size / c._count.lessons) * 100) : 0;
    },
  },
};
