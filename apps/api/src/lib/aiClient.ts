/**
 * HTTP client for the internal Python AI service.
 * Calls carry a shared secret header so the AI service only accepts requests from this API.
 */
import { env } from '../config/env';
import { AppError } from './errors';
import { logger } from './logger';

async function call<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 60_000, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`${env.AI_SERVICE_URL}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': env.INTERNAL_API_KEY,
        ...(rest.headers || {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    logger.error({ err, path }, 'AI service unreachable');
    throw new AppError(503, 'AI_UNAVAILABLE', 'The AI service is not reachable right now');
  }
  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body, path }, 'AI service error');
    throw new AppError(502, 'AI_ERROR', 'The AI service failed to answer');
  }
  return (await res.json()) as T;
}

export interface Citation {
  lessonId: string;
  lessonTitle: string;
  snippet: string;
  score: number;
}
export interface AskResult {
  answer: string;
  citations: Citation[];
  sessionId: string;
  mode: 'llm' | 'extractive';
}
export interface SearchHit {
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  snippet: string;
  score: number;
}
export interface GeneratedQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
}

export const aiClient = {
  indexLesson: (body: { courseId: string; lessonId: string; title: string; content: string }) =>
    call<{ chunks: number }>('/index', { method: 'POST', body: JSON.stringify(body) }),

  deleteLesson: (lessonId: string) =>
    call<{ deleted: number }>(`/index/lessons/${lessonId}`, { method: 'DELETE' }),

  deleteCourse: (courseId: string) =>
    call<{ deleted: number }>(`/index/courses/${courseId}`, { method: 'DELETE' }),

  ask: (body: { courseId: string; userId: string; question: string; sessionId?: string }) =>
    call<AskResult>('/ask', { method: 'POST', body: JSON.stringify(body) }),

  search: (query: string, limit = 10) =>
    call<{ hits: SearchHit[] }>('/search', { method: 'POST', body: JSON.stringify({ query, limit }) }),

  generateQuiz: (body: { courseId: string; lessonId: string; count: number }) =>
    call<{ questions: GeneratedQuestion[]; mode: string }>('/quiz', {
      method: 'POST',
      body: JSON.stringify(body),
      timeoutMs: 120_000,
    }),
};

/**
 * Indexing should never block or break the educator's save, so failures are logged, not thrown.
 * The lesson still saves; the educator can re-save to re-index.
 */
export function indexInBackground(lesson: { id: string; courseId: string; title: string; content: string }) {
  aiClient
    .indexLesson({ courseId: lesson.courseId, lessonId: lesson.id, title: lesson.title, content: lesson.content })
    .catch((err) => logger.warn({ err, lessonId: lesson.id }, 'Lesson indexing failed'));
}
