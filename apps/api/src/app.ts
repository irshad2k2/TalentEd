/**
 * Builds the Express app. Kept separate from index.ts (which starts listening) so tests can
 * create the app and call it with Supertest without opening a real port.
 */
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env, isProd } from './config/env';
import { buildContext, type GqlContext } from './graphql/context';
import { resolvers } from './graphql/resolvers';
import { typeDefs } from './graphql/schema';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { aiRouter } from './modules/ai/ai.routes';
import { authRouter } from './modules/auth/auth.routes';
import { coursesRouter } from './modules/courses/courses.routes';
import { enrollmentsRouter } from './modules/enrollments/enrollments.routes';
import { lessonsRouter } from './modules/lessons/lessons.routes';
import { paymentsRouter, webhookRouter } from './modules/payments/payments.routes';
import { quizzesRouter } from './modules/quizzes/quizzes.routes';
import { shareRouter } from './modules/share/share.routes';
import { uploadsRouter } from './modules/uploads/uploads.routes';

export async function createApp() {
  const app = express();
  app.set('trust proxy', 1); // correct client IPs behind a load balancer (rate limiting)

  app.use(helmet()); // secure default HTTP headers
  app.use(
    cors({
      origin: env.PUBLIC_URL, // only our web app may call the API from a browser
      credentials: true, // allow the refresh cookie
    }),
  );
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Webhook BEFORE express.json(): it needs the raw bytes to check the signature.
  app.use('/api', webhookRouter);

  app.use(express.json({ limit: '1mb' }));

  // REST
  app.use('/api/auth', authRouter);
  app.use(
    '/api',
    coursesRouter,
    lessonsRouter,
    enrollmentsRouter,
    paymentsRouter,
    uploadsRouter,
    quizzesRouter,
    aiRouter,
    shareRouter,
  );

  // GraphQL
  const apollo = new ApolloServer<GqlContext>({ typeDefs, resolvers, introspection: !isProd });
  await apollo.start();
  app.use('/graphql', expressMiddleware(apollo, { context: buildContext }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
