import type { CourseInput } from '@talented/shared';
import { prisma } from '../../config/db';
import { getOwnedCourse } from '../../lib/access';
import { aiClient } from '../../lib/aiClient';
import { badRequest } from '../../lib/errors';
import { logger } from '../../lib/logger';

export function createCourse(educatorId: string, input: CourseInput) {
  return prisma.course.create({ data: { ...input, educatorId } });
}

export async function updateCourse(courseId: string, educatorId: string, input: Partial<CourseInput>) {
  await getOwnedCourse(courseId, educatorId);
  return prisma.course.update({ where: { id: courseId }, data: input });
}

export async function setPublished(courseId: string, educatorId: string, published: boolean) {
  await getOwnedCourse(courseId, educatorId);
  if (published) {
    const lessons = await prisma.lesson.count({ where: { courseId } });
    if (lessons === 0) throw badRequest('Add at least one lesson before publishing');
  }
  return prisma.course.update({ where: { id: courseId }, data: { published } });
}

export async function deleteCourse(courseId: string, educatorId: string) {
  await getOwnedCourse(courseId, educatorId);
  await prisma.course.delete({ where: { id: courseId } }); // lessons, enrollments cascade
  aiClient.deleteCourse(courseId).catch((err) => logger.warn({ err }, 'AI cleanup failed'));
}

/** Full course for its owner's editor screen. */
export async function getManagedCourse(courseId: string, educatorId: string) {
  await getOwnedCourse(courseId, educatorId);
  return prisma.course.findUniqueOrThrow({
    where: { id: courseId },
    include: {
      lessons: { orderBy: { position: 'asc' } },
      _count: { select: { enrollments: true } },
    },
  });
}
