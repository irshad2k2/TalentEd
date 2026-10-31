import type { LessonInput } from '@talented/shared';
import { prisma } from '../../config/db';
import { assertCanViewContent, getOwnedCourse } from '../../lib/access';
import { aiClient, indexInBackground } from '../../lib/aiClient';
import { notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import type { AuthUser } from '../../middleware/auth';
import { assertUsableVideo, signedViewUrl } from '../uploads/uploads.service';

export async function addLesson(courseId: string, educatorId: string, input: LessonInput) {
  await getOwnedCourse(courseId, educatorId);
  if (input.videoKey) await assertUsableVideo(educatorId, input.videoKey);

  const position = input.position ?? (await prisma.lesson.count({ where: { courseId } }));
  const lesson = await prisma.lesson.create({
    data: { courseId, title: input.title, content: input.content, videoKey: input.videoKey ?? null, position },
  });
  indexInBackground(lesson); // AI tutor learns the new lesson
  return lesson;
}

export async function updateLesson(
  courseId: string,
  lessonId: string,
  educatorId: string,
  input: Partial<LessonInput>,
) {
  await getOwnedCourse(courseId, educatorId);
  const existing = await prisma.lesson.findFirst({ where: { id: lessonId, courseId } });
  if (!existing) throw notFound('Lesson');
  if (input.videoKey) await assertUsableVideo(educatorId, input.videoKey);

  const lesson = await prisma.lesson.update({ where: { id: lessonId }, data: input });
  if (input.content !== undefined || input.title !== undefined) indexInBackground(lesson);
  return lesson;
}

export async function deleteLesson(courseId: string, lessonId: string, educatorId: string) {
  await getOwnedCourse(courseId, educatorId);
  const deleted = await prisma.lesson.deleteMany({ where: { id: lessonId, courseId } });
  if (deleted.count === 0) throw notFound('Lesson');
  aiClient.deleteLesson(lessonId).catch((err) => logger.warn({ err }, 'AI cleanup failed'));
}

/** Lesson page for an enrolled student or the owner: content, signed video URL, progress, prev/next. */
export async function getLessonForViewer(courseId: string, lessonId: string, user: AuthUser) {
  await assertCanViewContent(courseId, user);

  const lessons = await prisma.lesson.findMany({
    where: { courseId },
    orderBy: { position: 'asc' },
    select: { id: true, title: true },
  });
  const index = lessons.findIndex((l) => l.id === lessonId);
  if (index === -1) throw notFound('Lesson');

  const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
  const done = await prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId: user.id, lessonId } },
  });

  return {
    lesson: {
      id: lesson.id,
      title: lesson.title,
      content: lesson.content,
      videoUrl: lesson.videoKey ? await signedViewUrl(lesson.videoKey) : null,
      completed: Boolean(done),
    },
    prevId: lessons[index - 1]?.id ?? null,
    nextId: lessons[index + 1]?.id ?? null,
  };
}

export async function completeLesson(courseId: string, lessonId: string, user: AuthUser) {
  await assertCanViewContent(courseId, user);
  const lesson = await prisma.lesson.findFirst({ where: { id: lessonId, courseId } });
  if (!lesson) throw notFound('Lesson');

  // upsert = "insert, or do nothing if it's already there" -> clicking twice is harmless
  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId: user.id, lessonId } },
    create: { userId: user.id, lessonId },
    update: {},
  });

  const [total, completed] = await Promise.all([
    prisma.lesson.count({ where: { courseId } }),
    prisma.lessonProgress.count({ where: { userId: user.id, lesson: { courseId } } }),
  ]);
  return { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 };
}
