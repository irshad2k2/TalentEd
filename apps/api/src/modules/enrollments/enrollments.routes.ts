import { Router } from 'express';
import { prisma } from '../../config/db';
import { asyncHandler } from '../../lib/asyncHandler';
import { AppError, badRequest, notFound } from '../../lib/errors';
import { currentUser, requireAuth } from '../../middleware/auth';

export const enrollmentsRouter = Router();

/** Free courses: enroll directly. Paid courses go through /checkout (payments module). */
enrollmentsRouter.post(
  '/courses/:courseId/enroll',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const course = await prisma.course.findFirst({ where: { id: req.params.courseId, published: true } });
    if (!course) throw notFound('Course');
    if (course.educatorId === user.id) throw badRequest('You own this course');
    if (course.pricePaise > 0) throw new AppError(402, 'PAYMENT_REQUIRED', 'This course requires payment');

    // upsert: enrolling twice is harmless, the unique (userId, courseId) index guarantees one row
    const enrollment = await prisma.enrollment.upsert({
      where: { userId_courseId: { userId: user.id, courseId: course.id } },
      create: { userId: user.id, courseId: course.id },
      update: {},
    });
    res.status(201).json({ enrollment });
  }),
);
