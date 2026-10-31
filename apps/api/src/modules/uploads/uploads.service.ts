/**
 * Direct-to-storage video uploads.
 *
 * 1. presign: browser asks for permission; API checks type/size and returns a short-lived PUT URL.
 * 2. browser PUTs the file straight to S3 (shows a progress bar). The API never touches the bytes,
 *    so a 2 GB upload doesn't tie up the Node process or its memory.
 * 3. complete: browser says "done"; API asks S3 (HeadObject) whether the object really exists with
 *    the promised size. Calling complete twice is safe (idempotent).
 */
import crypto from 'crypto';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PresignInput } from '@talented/shared';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { s3, s3Public } from '../../config/s3';
import { AppError, badRequest, notFound } from '../../lib/errors';

const UPLOAD_URL_TTL = 60 * 60; // 1 hour to finish a big upload
const VIEW_URL_TTL = 2 * 60 * 60; // 2 hours of playback

const safeName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/-+/g, '-').slice(-80);

export async function presignUpload(userId: string, input: PresignInput) {
  // Key is namespaced by user, so one user can never overwrite another's file.
  const key = `videos/${userId}/${crypto.randomUUID()}-${safeName(input.fileName)}`;

  await prisma.upload.create({
    data: { userId, key, contentType: input.contentType, size: BigInt(input.size) },
  });

  const url = await getSignedUrl(
    s3Public,
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: input.contentType }),
    { expiresIn: UPLOAD_URL_TTL },
  );
  return { key, url, expiresIn: UPLOAD_URL_TTL };
}

export async function completeUpload(userId: string, key: string, size: number) {
  const upload = await prisma.upload.findFirst({ where: { key, userId } });
  if (!upload) throw notFound('Upload');
  if (upload.status === 'COMPLETE') return { key, status: upload.status }; // retry-safe

  let head;
  try {
    head = await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  } catch {
    throw badRequest('File not found in storage yet - finish the upload first');
  }
  if (head.ContentLength !== Number(upload.size) || head.ContentLength !== size) {
    throw new AppError(422, 'SIZE_MISMATCH', 'Uploaded file size does not match');
  }

  const updated = await prisma.upload.update({ where: { id: upload.id }, data: { status: 'COMPLETE' } });
  return { key, status: updated.status };
}

/** A lesson may only reference a video its own author finished uploading. */
export async function assertUsableVideo(userId: string, key: string) {
  const upload = await prisma.upload.findFirst({ where: { key, userId, status: 'COMPLETE' } });
  if (!upload) throw badRequest('Video upload not found or not completed');
}

/** Short-lived GET URL so only signed-in, enrolled users can stream the video. */
export function signedViewUrl(key: string) {
  return getSignedUrl(s3Public, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), {
    expiresIn: VIEW_URL_TTL,
  });
}
