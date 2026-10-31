/**
 * Quizzes live in MongoDB: each quiz is one document holding an array of questions,
 * and each question holds an array of options. That nested, variable shape is awkward
 * as relational tables and natural as a document.
 */
import { Schema, model, type InferSchemaType } from 'mongoose';

const questionSchema = new Schema(
  {
    question: { type: String, required: true },
    options: { type: [String], required: true, validate: (v: string[]) => v.length === 4 },
    answerIndex: { type: Number, required: true, min: 0, max: 3 },
    explanation: { type: String },
  },
  { _id: false },
);

const quizSchema = new Schema(
  {
    courseId: { type: String, required: true, index: true }, // MySQL Course.id
    lessonId: { type: String, required: true },
    title: { type: String, required: true },
    questions: { type: [questionSchema], required: true },
    createdBy: { type: String, required: true },
    generatedBy: { type: String, enum: ['llm', 'extractive'], required: true },
  },
  { timestamps: true },
);

const attemptSchema = new Schema(
  {
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true },
    userId: { type: String, required: true },
    answers: { type: [Number], required: true },
    score: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { timestamps: true },
);
attemptSchema.index({ quizId: 1, userId: 1, score: -1 });

export type QuizDoc = InferSchemaType<typeof quizSchema>;
export const Quiz = model('Quiz', quizSchema);
export const QuizAttempt = model('QuizAttempt', attemptSchema);
