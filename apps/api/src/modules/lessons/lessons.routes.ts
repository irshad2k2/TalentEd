import { Router } from 'express';
import { lessonSchema, lessonUpdateSchema } from '@talented/shared';
import { asyncHandler } from '../../lib/asyncHandler';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import * as lessons from './lessons.service';

export const lessonsRouter = Router();
const educatorOnly = [requireAuth, requireRole('EDUCATOR')];

lessonsRouter.post(
  '/courses/:courseId/lessons',
  ...educatorOnly,
  validateBody(lessonSchema),
  asyncHandler(async (req, res) => {
    const lesson = await lessons.addLesson(req.params.courseId, currentUser(req).id, req.body);
    res.status(201).json({ lesson });
  }),
);

lessonsRouter.patch(
  '/courses/:courseId/lessons/:lessonId',
  ...educatorOnly,
  validateBody(lessonUpdateSchema),
  asyncHandler(async (req, res) => {
    const { courseId, lessonId } = req.params;
    res.json({ lesson: await lessons.updateLesson(courseId, lessonId, currentUser(req).id, req.body) });
  }),
);

lessonsRouter.delete(
  '/courses/:courseId/lessons/:lessonId',
  ...educatorOnly,
  asyncHandler(async (req, res) => {
    await lessons.deleteLesson(req.params.courseId, req.params.lessonId, currentUser(req).id);
    res.status(204).end();
  }),
);

lessonsRouter.get(
  '/courses/:courseId/lessons/:lessonId',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await lessons.getLessonForViewer(req.params.courseId, req.params.lessonId, currentUser(req)));
  }),
);

lessonsRouter.post(
  '/courses/:courseId/lessons/:lessonId/complete',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await lessons.completeLesson(req.params.courseId, req.params.lessonId, currentUser(req)));
  }),
);
