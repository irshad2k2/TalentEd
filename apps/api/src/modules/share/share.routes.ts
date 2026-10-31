/**
 * Password-protected preview links: an educator shares a (possibly unpublished) course with a
 * reviewer who has no account. The link holds a random token; the password is stored as a bcrypt
 * hash; links expire.
 */
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { createShareSchema, unlockShareSchema } from '@talented/shared';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { getOwnedCourse } from '../../lib/access';
import { asyncHandler } from '../../lib/asyncHandler';
import { randomToken } from '../../lib/crypto';
import { AppError, notFound } from '../../lib/errors';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import { validateBody } from '../../middleware/validate';

export const shareRouter = Router();

shareRouter.post(
  '/courses/:courseId/share',
  requireAuth,
  requireRole('EDUCATOR'),
  validateBody(createShareSchema),
  asyncHandler(async (req, res) => {
    const course = await getOwnedCourse(req.params.courseId, currentUser(req).id);
    const token = randomToken(24);
    const link = await prisma.shareLink.create({
      data: {
        courseId: course.id,
        token,
        passwordHash: await bcrypt.hash(req.body.password, 10),
        expiresAt: new Date(Date.now() + req.body.expiresInHours * 60 * 60 * 1000),
      },
    });
    res.status(201).json({ url: `${env.PUBLIC_URL}/share/${token}`, expiresAt: link.expiresAt });
  }),
);

shareRouter.post(
  '/share/:token/unlock',
  authLimiter, // stops password guessing
  validateBody(unlockShareSchema),
  asyncHandler(async (req, res) => {
    const link = await prisma.shareLink.findUnique({
      where: { token: req.params.token },
      include: {
        course: {
          include: {
            educator: { select: { name: true } },
            lessons: { orderBy: { position: 'asc' }, select: { id: true, title: true, content: true } },
          },
        },
      },
    });
    if (!link) throw notFound('Share link');
    if (link.expiresAt < new Date()) throw new AppError(410, 'EXPIRED', 'This share link has expired');
    if (!(await bcrypt.compare(req.body.password, link.passwordHash))) {
      throw new AppError(401, 'WRONG_PASSWORD', 'Wrong password');
    }

    const { course } = link;
    res.json({
      course: {
        title: course.title,
        description: course.description,
        educator: course.educator.name,
        lessons: course.lessons.map((l, i) => ({
          id: l.id,
          title: l.title,
          // Preview: first lesson in full, the rest as titles only
          content: i === 0 ? l.content : null,
        })),
      },
    });
  }),
);
