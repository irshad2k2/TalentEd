import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@talented/shared';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../lib/errors';

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
}

// Adds `req.user` to Express's Request type.
declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

interface AccessPayload {
  sub: string;
  role: Role;
  name: string;
}

/** Reads "Authorization: Bearer <jwt>" and returns the user, or null if missing/invalid/expired. */
export function userFromHeader(header: string | undefined): AuthUser | null {
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as AccessPayload;
    return { id: payload.sub, role: payload.role, name: payload.name };
  } catch {
    return null;
  }
}

/** Rejects the request with 401 unless a valid access token is present. */
export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const user = userFromHeader(req.headers.authorization);
  if (!user) return next(unauthorized('Access token missing or expired'));
  req.user = user;
  next();
};

/** Use after requireAuth: rejects with 403 unless the user has one of the given roles. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
    next();
  };

/** Small helper so route handlers get a non-null user with types. */
export const currentUser = (req: Request): AuthUser => {
  if (!req.user) throw unauthorized();
  return req.user;
};
