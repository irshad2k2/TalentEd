import rateLimit from 'express-rate-limit';

const skip = () => process.env.NODE_ENV === 'test';

/** Slows down password guessing: 20 auth attempts per 15 minutes per IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
});

/** AI calls cost money: 30 per minute per IP. */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many AI requests, slow down' } },
});
