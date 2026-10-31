import { Router } from 'express';
import { completeUploadSchema, presignSchema } from '@talented/shared';
import { asyncHandler } from '../../lib/asyncHandler';
import { currentUser, requireAuth, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import * as uploads from './uploads.service';

export const uploadsRouter = Router();
const educatorOnly = [requireAuth, requireRole('EDUCATOR')];

uploadsRouter.post(
  '/uploads/presign',
  ...educatorOnly,
  validateBody(presignSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await uploads.presignUpload(currentUser(req).id, req.body));
  }),
);

uploadsRouter.post(
  '/uploads/complete',
  ...educatorOnly,
  validateBody(completeUploadSchema),
  asyncHandler(async (req, res) => {
    res.json(await uploads.completeUpload(currentUser(req).id, req.body.key, req.body.size));
  }),
);
