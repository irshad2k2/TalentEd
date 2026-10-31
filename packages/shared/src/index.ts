/**
 * Shared validation schemas.
 *
 * The SAME schema validates the React form (client side, instant feedback)
 * and the API request body (server side, the real security boundary).
 * Change a rule here and both sides change together.
 */
import { z } from 'zod';

// ---------- Auth ----------
export const roleSchema = z.enum(['STUDENT', 'EDUCATOR']);
export type Role = z.infer<typeof roleSchema>;

export const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters') // bcrypt only uses 72 bytes
    .regex(/[A-Za-z]/, 'Password needs a letter')
    .regex(/[0-9]/, 'Password needs a number'),
  role: roleSchema.default('STUDENT'),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ---------- Courses ----------
export const courseSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(2000),
  category: z.string().trim().min(2).max(40),
  // Price in paise (INR x 100). 0 = free course. Integers avoid floating-point money bugs.
  pricePaise: z.coerce.number().int().min(0).max(10_000_00),
});
export type CourseInput = z.infer<typeof courseSchema>;
export const courseUpdateSchema = courseSchema.partial();

// ---------- Lessons ----------
export const lessonSchema = z.object({
  title: z.string().trim().min(3).max(120),
  // Markdown body. Also the text the AI tutor learns from.
  content: z.string().trim().min(1, 'Lesson content is required').max(50_000),
  videoKey: z.string().max(300).nullish(),
  position: z.coerce.number().int().min(0).optional(),
});
export type LessonInput = z.infer<typeof lessonSchema>;
export const lessonUpdateSchema = lessonSchema.partial();

// ---------- Uploads ----------
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

export const presignSchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.enum(ALLOWED_VIDEO_TYPES),
  size: z.number().int().positive().max(MAX_VIDEO_BYTES, 'Video must be 2 GB or smaller'),
});
export type PresignInput = z.infer<typeof presignSchema>;

export const completeUploadSchema = z.object({
  key: z.string().min(1).max(300),
  size: z.number().int().positive(),
});

// ---------- Payments ----------
export const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

// ---------- Quizzes ----------
export const quizQuestionSchema = z.object({
  question: z.string().min(3),
  options: z.array(z.string().min(1)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().optional(),
});
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

export const quizSubmitSchema = z.object({
  answers: z.array(z.number().int().min(-1).max(3)).min(1),
});

// ---------- AI ----------
export const askSchema = z.object({
  question: z.string().trim().min(3, 'Ask a longer question').max(1000),
  sessionId: z.string().max(64).optional(),
});
export type AskInput = z.infer<typeof askSchema>;

// ---------- Share links ----------
export const createShareSchema = z.object({
  password: z.string().min(4, 'Password must be at least 4 characters').max(72),
  expiresInHours: z.coerce.number().int().min(1).max(24 * 30).default(72),
});
export const unlockShareSchema = z.object({ password: z.string().min(1) });

// ---------- Common ----------
/** Consistent error body returned by every API error. */
export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
