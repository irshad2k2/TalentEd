/**
 * Razorpay integration using its REST API directly (no SDK), so every step is visible.
 * Docs: https://razorpay.com/docs/payments/server-integration/nodejs/
 */
import { env } from '../../config/env';
import { hmacSha256, safeEqual } from '../../lib/crypto';
import { AppError, unavailable } from '../../lib/errors';

export const isRazorpayConfigured = () => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export async function createRazorpayOrder(amountPaise: number, receipt: string, notes: Record<string, string>) {
  if (!isRazorpayConfigured()) throw unavailable('Payments are not configured on this server');

  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Could not create payment order');
  return (await res.json()) as RazorpayOrder;
}

/**
 * Browser callback check. Razorpay signs "order_id|payment_id" with our key secret.
 * Only Razorpay and this server know the secret, so a valid signature proves the payment is real.
 */
export function isValidCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret = env.RAZORPAY_KEY_SECRET ?? '',
): boolean {
  if (!secret) return false;
  return safeEqual(hmacSha256(secret, `${orderId}|${paymentId}`), signature);
}

/** Webhook check: Razorpay signs the RAW request body with the webhook secret. */
export function isValidWebhookSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret = env.RAZORPAY_WEBHOOK_SECRET ?? '',
): boolean {
  if (!secret || !signature) return false;
  return safeEqual(hmacSha256(secret, rawBody), signature);
}
