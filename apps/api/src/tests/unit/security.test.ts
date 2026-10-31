/**
 * Unit tests: no database needed. Run anywhere with `npm run test:unit`.
 */
import jwt from 'jsonwebtoken';
import { signupSchema, presignSchema } from '@talented/shared';
import { hmacSha256, safeEqual } from '../../lib/crypto';
import { userFromHeader } from '../../middleware/auth';
import { signAccessToken } from '../../modules/auth/auth.service';
import { isValidCheckoutSignature, isValidWebhookSignature } from '../../modules/payments/razorpay';

describe('Razorpay signatures', () => {
  const secret = 'rzp_test_secret';

  it('accepts a checkout signature made with our secret', () => {
    const sig = hmacSha256(secret, 'order_1|pay_1');
    expect(isValidCheckoutSignature('order_1', 'pay_1', sig, secret)).toBe(true);
  });

  it('rejects a tampered payment id', () => {
    const sig = hmacSha256(secret, 'order_1|pay_1');
    expect(isValidCheckoutSignature('order_1', 'pay_2', sig, secret)).toBe(false);
  });

  it('verifies the webhook over the raw body bytes', () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const sig = hmacSha256('whsec', body);
    expect(isValidWebhookSignature(body, sig, 'whsec')).toBe(true);
    expect(isValidWebhookSignature(Buffer.from('{"event":"x"}'), sig, 'whsec')).toBe(false);
    expect(isValidWebhookSignature(body, undefined, 'whsec')).toBe(false);
  });

  it('safeEqual handles different lengths without throwing', () => {
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('Access tokens', () => {
  it('round-trips a signed token', () => {
    const token = signAccessToken({ id: 'u1', role: 'EDUCATOR', name: 'Priya' });
    expect(userFromHeader(`Bearer ${token}`)).toEqual({ id: 'u1', role: 'EDUCATOR', name: 'Priya' });
  });

  it('rejects a token signed with another secret', () => {
    const forged = jwt.sign({ role: 'EDUCATOR', name: 'x' }, 'another-secret-that-is-long-enough', {
      subject: 'u1',
    });
    expect(userFromHeader(`Bearer ${forged}`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ role: 'STUDENT', name: 'x' }, process.env.JWT_ACCESS_SECRET!, {
      subject: 'u1',
      expiresIn: -10,
    });
    expect(userFromHeader(`Bearer ${expired}`)).toBeNull();
  });
});

describe('Shared validation schemas', () => {
  it('normalises email and applies the default role', () => {
    const parsed = signupSchema.parse({ name: 'Asha', email: '  ASHA@Mail.com ', password: 'secret123' });
    expect(parsed.email).toBe('asha@mail.com');
    expect(parsed.role).toBe('STUDENT');
  });

  it('rejects weak passwords', () => {
    expect(signupSchema.safeParse({ name: 'Asha', email: 'a@b.co', password: 'password' }).success).toBe(false);
  });

  it('rejects videos over 2 GB', () => {
    const tooBig = { fileName: 'a.mp4', contentType: 'video/mp4', size: 2 * 1024 ** 3 + 1 };
    expect(presignSchema.safeParse(tooBig).success).toBe(false);
  });
});
