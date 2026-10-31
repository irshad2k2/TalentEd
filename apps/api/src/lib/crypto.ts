import crypto from 'crypto';

/** Cryptographically random, URL-safe token (used for refresh tokens and share links). */
export const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString('base64url');

/** SHA-256 hex digest. Fast hash is fine here because the input is a long random token, not a password. */
export const sha256 = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

/** HMAC-SHA256 hex digest (used to verify Razorpay signatures). */
export const hmacSha256 = (secret: string, payload: string | Buffer): string =>
  crypto.createHmac('sha256', secret).update(payload).digest('hex');

/** Constant-time string comparison - prevents timing attacks on signature checks. */
export const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};
