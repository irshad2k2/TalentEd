import mongoose from 'mongoose';
import { quizQuestionSchema, type QuizQuestion } from '@talented/shared';
import { prisma } from '../../config/db';
import { assertCanViewContent, getOwnedCourse } from '../../lib/access';
import { aiClient } from '../../lib/aiClient';
import { AppError, badRequest, notFound } from '../../lib/errors';
import type { AuthUser } from '../../middleware/auth';
import { Quiz, QuizAttempt } from './quiz.model';

export async function generateQuiz(courseId: string, lessonId: string, educatorId: string, count = 5) {
  await getOwnedCourse(courseId, educatorId);
  const lesson = await prisma.lesson.findFirst({ where: { id: lessonId, courseId } });
  if (!lesson) throw notFound('Lesson');

  const result = await aiClient.generateQuiz({ courseId, lessonId, count });

  // Never trust model output blindly: keep only questions that pass the shared schema.
  const questions: QuizQuestion[] = result.questions.flatMap((q) => {
    const parsed = quizQuestionSchema.safeParse(q);
    return parsed.success ? [parsed.data] : [];
  });
  if (questions.length === 0) {
    throw new AppError(422, 'QUIZ_EMPTY', 'Could not generate questions - add more lesson content');
  }

  return Quiz.create({
    courseId,
    lessonId,
    title: `Quiz: ${lesson.title}`,
    questions,
    createdBy: educatorId,
    generatedBy: result.mode === 'llm' ? 'llm' : 'extractive',
  });
}

export async function listQuizzes(courseId: string, user: AuthUser) {
  await assertCanViewContent(courseId, user);
  const quizzes = await Quiz.find({ courseId }).sort({ createdAt: 1 }).lean();
  const best = await QuizAttempt.aggregate<{ _id: mongoose.Types.ObjectId; best: number }>([
    { $match: { userId: user.id, quizId: { $in: quizzes.map((q) => q._id) } } },
    { $group: { _id: '$quizId', best: { $max: '$score' } } },
  ]);
  const bestById = new Map(best.map((b) => [String(b._id), b.best]));
  return quizzes.map((q) => ({
    id: String(q._id),
    title: q.title,
    lessonId: q.lessonId,
    questionCount: q.questions.length,
    bestScore: bestById.get(String(q._id)) ?? null,
  }));
}

async function findQuiz(quizId: string) {
  if (!mongoose.isValidObjectId(quizId)) throw notFound('Quiz');
  const quiz = await Quiz.findById(quizId);
  if (!quiz) throw notFound('Quiz');
  return quiz;
}

/** Questions WITHOUT answers, so the answer key never reaches the browser before submitting. */
export async function getQuizForTaking(quizId: string, user: AuthUser) {
  const quiz = await findQuiz(quizId);
  await assertCanViewContent(quiz.courseId, user);
  return {
    id: String(quiz._id),
    courseId: quiz.courseId,
    title: quiz.title,
    questions: quiz.questions.map((q) => ({ question: q.question, options: q.options })),
  };
}

export async function submitQuiz(quizId: string, user: AuthUser, answers: number[]) {
  const quiz = await findQuiz(quizId);
  await assertCanViewContent(quiz.courseId, user);
  if (answers.length !== quiz.questions.length) {
    throw badRequest(`Expected ${quiz.questions.length} answers`);
  }

  const results = quiz.questions.map((q, i) => ({
    correct: answers[i] === q.answerIndex,
    answerIndex: q.answerIndex,
    explanation: q.explanation ?? null,
  }));
  const score = results.filter((r) => r.correct).length;

  await QuizAttempt.create({ quizId: quiz._id, userId: user.id, answers, score, total: results.length });
  return { score, total: results.length, results };
}

export async function deleteQuiz(quizId: string, educatorId: string) {
  const quiz = await findQuiz(quizId);
  await getOwnedCourse(quiz.courseId, educatorId);
  await Promise.all([quiz.deleteOne(), QuizAttempt.deleteMany({ quizId: quiz._id })]);
}
