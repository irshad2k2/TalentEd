import type { Express } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../app';
import { connectMongo, prisma } from '../../config/db';

/** Integration tests need MySQL + MongoDB. CI sets INTEGRATION=1; locally run them with compose up. */
export const describeIntegration = process.env.INTEGRATION === '1' ? describe : describe.skip;

let app: Express;
export async function getApp() {
  if (!app) {
    await connectMongo();
    app = await createApp();
  }
  return app;
}

/** Empty every table between tests, children first. */
export async function resetDb() {
  await prisma.$transaction([
    prisma.payment.deleteMany(),
    prisma.order.deleteMany(),
    prisma.lessonProgress.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.shareLink.deleteMany(),
    prisma.lesson.deleteMany(),
    prisma.course.deleteMany(),
    prisma.upload.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  if (mongoose.connection.db) await mongoose.connection.db.dropDatabase();
}

export async function closeAll() {
  await prisma.$disconnect();
  await mongoose.disconnect();
}

let counter = 0;
export async function signup(role: 'STUDENT' | 'EDUCATOR' = 'STUDENT') {
  counter += 1;
  const res = await request(await getApp())
    .post('/api/auth/signup')
    .send({ name: `User ${counter}`, email: `user${counter}@test.dev`, password: 'Password123', role })
    .expect(201);
  return {
    token: res.body.accessToken as string,
    user: res.body.user as { id: string },
    cookie: res.headers['set-cookie'] as unknown as string[],
  };
}

/** Educator with one published free course containing one lesson. */
export async function educatorWithCourse(pricePaise = 0) {
  const edu = await signup('EDUCATOR');
  const course = await prisma.course.create({
    data: {
      educatorId: edu.user.id,
      title: 'Test course',
      description: 'A course used in tests',
      category: 'Testing',
      pricePaise,
      published: true,
      lessons: { create: [{ title: 'Lesson one', content: 'Hello world', position: 0 }] },
    },
    include: { lessons: true },
  });
  return { edu, course };
}
