/**
 * The browser never talks to the AI service directly. The API checks who you are and whether
 * you're enrolled, THEN forwards the question. That keeps the AI service private and lets us
 * rate-limit and authorise in one place.
 */
import { Router } from 'express';
import { askSchema } from '@talented/shared';
import { prisma } from '../../config/db';
import { assertCanViewContent } from '../../lib/access';
import { aiClient } from '../../lib/aiClient';
import { asyncHandler } from '../../lib/asyncHandler';
import { badRequest } from '../../lib/errors';
import { currentUser, requireAuth } from '../../middleware/auth';
import { aiLimiter } from '../../middleware/rateLimit';
import { validateBody } from '../../middleware/validate';

export const aiRouter = Router();

aiRouter.post(
  '/courses/:courseId/ai/ask',
  aiLimiter,
  requireAuth,
  validateBody(askSchema),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    await assertCanViewContent(req.params.courseId, user);
    const result = await aiClient.ask({
      courseId: req.params.courseId,
      userId: user.id,
      question: req.body.question,
      sessionId: req.body.sessionId,
    });
    res.json(result);
  }),
);

/** Semantic search: finds lessons by MEANING, not exact words ("how do loops work" finds "for and while"). */
aiRouter.get(
  '/ai/search',
  aiLimiter,
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2 || q.length > 200) throw badRequest('Query must be 2-200 characters');

    const { hits } = await aiClient.search(q, 30);
    // The AI index holds drafts too; only show published courses in public search.
    const courses = await prisma.course.findMany({
      where: { id: { in: [...new Set(hits.map((h) => h.courseId))] }, published: true },
      select: { id: true, title: true },
    });
    const titleById = new Map(courses.map((c) => [c.id, c.title]));

    const results = hits
      .filter((h) => titleById.has(h.courseId))
      .slice(0, 10)
      .map((h) => ({ ...h, courseTitle: titleById.get(h.courseId) }));
    res.json({ results });
  }),
);
