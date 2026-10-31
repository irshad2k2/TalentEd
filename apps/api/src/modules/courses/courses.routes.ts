import { Router } from 'express';
import { z } from 'zod';
import { courseSchema, courseUpdateSchema } from '@talented/shared';
import { asyncHandler } from '../../lib/asyncHandler';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import * as courses from './courses.service';

export const coursesRouter = Router();
const educatorOnly = [requireAuth, requireRole('EDUCATOR')];

// Reading the public catalog happens over GraphQL. These REST routes are the "commands".

coursesRouter.post(
  '/courses',
  ...educatorOnly,
  validateBody(courseSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ course: await courses.createCourse(currentUser(req).id, req.body) });
  }),
);

coursesRouter.get(
  '/courses/:courseId/manage',
  ...educatorOnly,
  asyncHandler(async (req, res) => {
    res.json({ course: await courses.getManagedCourse(req.params.courseId, currentUser(req).id) });
  }),
);

coursesRouter.patch(
  '/courses/:courseId',
  ...educatorOnly,
  validateBody(courseUpdateSchema),
  asyncHandler(async (req, res) => {
    res.json({ course: await courses.updateCourse(req.params.courseId, currentUser(req).id, req.body) });
  }),
);

coursesRouter.post(
  '/courses/:courseId/publish',
  ...educatorOnly,
  validateBody(z.object({ published: z.boolean() })),
  asyncHandler(async (req, res) => {
    const course = await courses.setPublished(req.params.courseId, currentUser(req).id, req.body.published);
    res.json({ course });
  }),
);

coursesRouter.delete(
  '/courses/:courseId',
  ...educatorOnly,
  asyncHandler(async (req, res) => {
    await courses.deleteCourse(req.params.courseId, currentUser(req).id);
    res.status(204).end();
  }),
);
