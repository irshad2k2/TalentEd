/**
 * Access rules in one place, so every route enforces them the same way.
 *
 * Rule: if you are not allowed to know something exists, you get 404, never 403.
 * An educator asking for another educator's draft course gets "Course not found".
 */
import type { Course } from '@prisma/client';
import { prisma } from '../config/db';
import type { AuthUser } from '../middleware/auth';
import { AppError, notFound } from './errors';

/** The course, only if `educatorId` owns it. */
export async function getOwnedCourse(courseId: string, educatorId: string): Promise<Course> {
  const course = await prisma.course.findFirst({ where: { id: courseId, educatorId } });
  if (!course) throw notFound('Course');
  return course;
}

/** Owner or enrolled student can see lesson content. */
export async function assertCanViewContent(
  courseId: string,
  user: AuthUser,
): Promise<{ course: Course; isOwner: boolean }> {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw notFound('Course');

  const isOwner = course.educatorId === user.id;
  if (isOwner) return { course, isOwner };

  // Drafts are invisible to everyone except the owner.
  if (!course.published) throw notFound('Course');

  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });
  if (!enrolled) throw new AppError(403, 'NOT_ENROLLED', 'Enroll in this course to access it');
  return { course, isOwner };
}
