import { PrismaClient } from '@prisma/client';
import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../lib/logger';

/** MySQL (via Prisma): one shared client for the whole process. */
export const prisma = new PrismaClient();

/** MongoDB (via Mongoose). */
export async function connectMongo(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGO_URL);
  logger.info('MongoDB connected');
}

export async function disconnectAll(): Promise<void> {
  await Promise.allSettled([prisma.$disconnect(), mongoose.disconnect()]);
}
