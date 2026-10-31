import { Router } from 'express';
import { z } from 'zod';
import { quizSubmitSchema } from '@talented/shared';
import { asyncHandler } from '../../lib/asyncHandler';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth';
import { aiLimiter } from '../../middleware/rateLimit';
import { validateBody } from '../../middleware/validate';
import * as quizzes from './quizzes.service';

export const quizzesRouter = Router();

quizzesRouter.post(
  '/courses/:courseId/quizzes/generate',
  aiLimiter,
  requireAuth,
  requireRole('EDUCATOR'),
  validateBody(z.object({ lessonId: z.string().min(1), count: z.number().int().min(1).max(10).default(5) })),
  asyncHandler(async (req, res) => {
    const { lessonId, count } = req.body;
    const quiz = await quizzes.generateQuiz(req.params.courseId, lessonId, currentUser(req).id, count);
    res.status(201).json({ quiz: { id: String(quiz._id), title: quiz.title, questions: quiz.questions } });
  }),
);

quizzesRouter.get(
  '/courses/:courseId/quizzes',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ quizzes: await quizzes.listQuizzes(req.params.courseId, currentUser(req)) });
  }),
);

quizzesRouter.get(
  '/quizzes/:quizId',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ quiz: await quizzes.getQuizForTaking(req.params.quizId, currentUser(req)) });
  }),
);

quizzesRouter.post(
  '/quizzes/:quizId/submit',
  requireAuth,
  validateBody(quizSubmitSchema),
  asyncHandler(async (req, res) => {
    res.json(await quizzes.submitQuiz(req.params.quizId, currentUser(req), req.body.answers));
  }),
);

quizzesRouter.delete(
  '/quizzes/:quizId',
  requireAuth,
  requireRole('EDUCATOR'),
  asyncHandler(async (req, res) => {
    await quizzes.deleteQuiz(req.params.quizId, currentUser(req).id);
    res.status(204).end();
  }),
);
