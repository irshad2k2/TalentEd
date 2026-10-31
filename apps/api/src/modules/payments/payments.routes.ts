import express, { Router } from 'express';
import { verifyPaymentSchema } from '@talented/shared';
import { asyncHandler } from '../../lib/asyncHandler';
import { unauthorized } from '../../lib/errors';
import { currentUser, requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import * as payments from './payments.service';
import { isValidWebhookSignature } from './razorpay';

export const paymentsRouter = Router();

paymentsRouter.post(
  '/courses/:courseId/checkout',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.status(201).json(await payments.createCheckout(req.params.courseId, currentUser(req)));
  }),
);

paymentsRouter.post(
  '/payments/verify',
  requireAuth,
  validateBody(verifyPaymentSchema),
  asyncHandler(async (req, res) => {
    res.json(await payments.verifyCallback(currentUser(req), req.body));
  }),
);

/**
 * Razorpay -> our server. No user token here; trust comes from the HMAC signature.
 * The signature is computed over the EXACT bytes Razorpay sent, so this route needs the raw body
 * (express.raw), not parsed JSON. app.ts mounts this router before express.json() for that reason.
 */
export const webhookRouter = Router();
webhookRouter.post(
  '/payments/webhook',
  express.raw({ type: 'application/json', limit: '1mb' }),
  asyncHandler(async (req, res) => {
    const raw = req.body as Buffer;
    if (!isValidWebhookSignature(raw, req.header('x-razorpay-signature'))) {
      throw unauthorized('Invalid webhook signature');
    }
    const result = await payments.handleWebhookEvent(JSON.parse(raw.toString('utf8')));
    res.json({ ok: true, ...result }); // 2xx tells Razorpay not to retry
  }),
);
