/**
 * Environment variables are parsed ONCE at startup with Zod.
 * If something required is missing, the server refuses to start with a clear message
 * instead of failing later in the middle of a request.
 */
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  PUBLIC_URL: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1),
  MONGO_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  REFRESH_TOKEN_PEPPER: z.string().min(16),
  INTERNAL_API_KEY: z.string().min(8),

  S3_BUCKET: z.string().default('talented-videos'),
  S3_REGION: z.string().default('ap-south-1'),
  S3_ENDPOINT: z.string().optional(),
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_DAYS = 7;
