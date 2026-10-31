import { Router, type CookieOptions, type Response } from 'express';
import { loginSchema, signupSchema } from '@talented/shared';
import { REFRESH_TOKEN_TTL_DAYS, env } from '../../config/env';
import { asyncHandler } from '../../lib/asyncHandler';
import { currentUser, requireAuth } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import { validateBody } from '../../middleware/validate';
import * as auth from './auth.service';

export const REFRESH_COOKIE = 'te_rt';

const cookieOptions: CookieOptions = {
  httpOnly: true, // not readable from JavaScript
  // HTTPS-only whenever the site is served over HTTPS (a plain-HTTP demo would otherwise drop the cookie)
  secure: env.PUBLIC_URL.startsWith('https://'),
  sameSite: 'lax', // not sent on cross-site POSTs -> CSRF protection
  path: '/api/auth', // only sent to auth endpoints, nowhere else
  maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};

/** Puts the refresh token in the cookie and returns only the access token + user in the body. */
function sendSession(res: Response, session: auth.Session, status = 200) {
  res.cookie(REFRESH_COOKIE, session.refreshToken, cookieOptions);
  res.status(status).json({ accessToken: session.accessToken, user: session.user });
}

export const authRouter = Router();

authRouter.post(
  '/signup',
  authLimiter,
  validateBody(signupSchema),
  asyncHandler(async (req, res) => sendSession(res, await auth.signup(req.body), 201)),
);

authRouter.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => sendSession(res, await auth.login(req.body))),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    try {
      sendSession(res, await auth.refresh(req.cookies?.[REFRESH_COOKIE]));
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, { ...cookieOptions, maxAge: undefined });
      throw err;
    }
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { ...cookieOptions, maxAge: undefined });
    res.status(204).end();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => res.json({ user: await auth.getMe(currentUser(req).id) })),
);
