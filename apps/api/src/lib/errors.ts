/**
 * One error class for every expected failure. The error handler turns it into
 * the same JSON shape every time:  { "error": { "code", "message", "details"? } }
 */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have permission to do this') =>
  new AppError(403, 'FORBIDDEN', message);
/** Also used for "exists but not yours" so attackers can't probe which ids exist. */
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);
export const unavailable = (message: string) => new AppError(503, 'UNAVAILABLE', message);
