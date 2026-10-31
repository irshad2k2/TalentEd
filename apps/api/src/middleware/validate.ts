import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { badRequest } from '../lib/errors';

/**
 * Validates req.body against a shared Zod schema and REPLACES it with the parsed value
 * (trimmed strings, lower-cased email, defaults applied). Unknown fields are stripped.
 */
export const validateBody =
  (schema: ZodTypeAny): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(badRequest('Validation failed', result.error.flatten().fieldErrors));
    }
    req.body = result.data;
    next();
  };
