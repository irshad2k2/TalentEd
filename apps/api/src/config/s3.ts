/**
 * S3 client. Locally this talks to MinIO (S3-compatible); in production to AWS S3.
 *
 * Two clients exist because, inside Docker, the API reaches storage at http://minio:9000
 * but the BROWSER must use http://localhost:9000. A presigned URL embeds the host it was
 * signed for, so URLs handed to the browser are signed with the public endpoint.
 */
import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from './env';
import { logger } from '../lib/logger';

function makeClient(endpoint?: string): S3Client {
  return new S3Client({
    region: env.S3_REGION,
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(endpoint), // MinIO needs path-style URLs
    credentials:
      env.S3_ACCESS_KEY && env.S3_SECRET_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY }
        : undefined, // on AWS, fall back to the instance role
  });
}

/** Used by the API itself (HeadObject etc). */
export const s3 = makeClient(env.S3_ENDPOINT);
/** Used only to sign URLs that the browser will call. */
export const s3Public = makeClient(env.S3_PUBLIC_ENDPOINT || env.S3_ENDPOINT);

/**
 * Makes sure the video bucket exists and allows browser uploads from our site.
 * Runs at startup, so no separate "create bucket" container or manual step is needed.
 * Storage may still be booting when the API starts, so it retries for ~30 seconds.
 * Never throws: uploads fail later with a clear error instead of the API refusing to start.
 */
export async function ensureBucket(attempts = 15): Promise<void> {
  const Bucket = env.S3_BUCKET;
  for (let i = 1; i <= attempts; i++) {
    try {
      try {
        await s3.send(new HeadBucketCommand({ Bucket }));
      } catch (err) {
        const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status !== 404) throw err; // storage not reachable yet -> retry
        await s3.send(new CreateBucketCommand({ Bucket }));
        logger.info({ Bucket }, 'Created storage bucket');
      }
      break;
    } catch (err) {
      if (i === attempts) {
        logger.warn({ err, Bucket }, 'Storage not reachable; video uploads will fail until it is');
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Browsers PUT/GET straight to storage, so the bucket must allow our site's origin.
  // AWS S3 needs this rule; MinIO allows all origins already and may answer NotImplemented.
  try {
    await s3.send(
      new PutBucketCorsCommand({
        Bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: [env.PUBLIC_URL],
              AllowedMethods: ['GET', 'PUT', 'HEAD'],
              AllowedHeaders: ['*'],
              ExposeHeaders: ['ETag'],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
  } catch {
    logger.debug('Bucket CORS not set (storage manages CORS itself)');
  }
}
