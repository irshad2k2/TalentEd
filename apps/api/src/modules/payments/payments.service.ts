/**
 * Paid enrollment.
 *
 * Two independent signals can say "payment succeeded":
 *   1. CALLBACK - the browser posts Razorpay's response right after checkout
 *   2. WEBHOOK  - Razorpay's server calls ours (works even if the user closed the tab)
 * They often arrive at the same moment. fulfil() must enroll the student EXACTLY ONCE.
 *
 * How: the Payment table has a UNIQUE index on razorpayPaymentId. Both paths try to insert the
 * same id inside a transaction. The database lets exactly one succeed; the other gets error P2002
 * and its whole transaction rolls back. No double enrollment, no double ledger entry.
 */
import { Prisma } from '@prisma/client';
import type { VerifyPaymentInput } from '@talented/shared';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import type { AuthUser } from '../../middleware/auth';
import { createRazorpayOrder, isValidCheckoutSignature } from './razorpay';

export async function createCheckout(courseId: string, user: AuthUser) {
  const course = await prisma.course.findFirst({ where: { id: courseId, published: true } });
  if (!course) throw notFound('Course');
  if (course.educatorId === user.id) throw badRequest('You own this course');
  if (course.pricePaise === 0) throw badRequest('This course is free - enroll directly');

  const already = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId } },
  });
  if (already) throw conflict('You are already enrolled');

  // Amount always comes from OUR database, never from the browser.
  const rzp = await createRazorpayOrder(course.pricePaise, `c_${course.id}`.slice(0, 40), {
    courseId: course.id,
    userId: user.id,
  });
  await prisma.order.create({
    data: { userId: user.id, courseId, razorpayOrderId: rzp.id, amountPaise: course.pricePaise },
  });

  return {
    orderId: rzp.id,
    amount: rzp.amount,
    currency: rzp.currency,
    keyId: env.RAZORPAY_KEY_ID,
    courseTitle: course.title,
  };
}

export async function verifyCallback(user: AuthUser, input: VerifyPaymentInput) {
  const ok = isValidCheckoutSignature(
    input.razorpay_order_id,
    input.razorpay_payment_id,
    input.razorpay_signature,
  );
  if (!ok) throw badRequest('Invalid payment signature');

  const order = await prisma.order.findFirst({
    where: { razorpayOrderId: input.razorpay_order_id, userId: user.id },
  });
  if (!order) throw notFound('Order');

  return fulfil(order.id, input.razorpay_payment_id, order.amountPaise, 'CALLBACK');
}

export async function handleWebhookEvent(event: {
  event: string;
  payload?: { payment?: { entity?: { id: string; order_id: string; amount: number; status: string } } };
}) {
  if (event.event !== 'payment.captured') return { ignored: true };
  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id) return { ignored: true };

  const order = await prisma.order.findUnique({ where: { razorpayOrderId: payment.order_id } });
  if (!order) {
    logger.warn({ orderId: payment.order_id }, 'Webhook for unknown order');
    return { ignored: true };
  }
  if (payment.amount !== order.amountPaise) {
    logger.error({ orderId: order.id, paid: payment.amount, expected: order.amountPaise }, 'Amount mismatch');
    return { ignored: true };
  }
  return fulfil(order.id, payment.id, payment.amount, 'WEBHOOK');
}

/** Idempotent: safe to call any number of times, from any number of paths, concurrently. */
export async function fulfil(
  orderId: string,
  razorpayPaymentId: string,
  amountPaise: number,
  source: 'CALLBACK' | 'WEBHOOK',
) {
  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      await tx.payment.create({ data: { orderId, razorpayPaymentId, amountPaise, source } });
      await tx.order.update({ where: { id: orderId }, data: { status: 'PAID' } });
      await tx.enrollment.upsert({
        where: { userId_courseId: { userId: order.userId, courseId: order.courseId } },
        create: { userId: order.userId, courseId: order.courseId },
        update: {},
      });
    });
    logger.info({ orderId, source }, 'Payment fulfilled');
    return { enrolled: true, alreadyProcessed: false };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      // The other path got there first. Nothing to do - the student is already enrolled.
      logger.info({ orderId, source }, 'Payment already fulfilled by the other path');
      return { enrolled: true, alreadyProcessed: true };
    }
    throw err;
  }
}
