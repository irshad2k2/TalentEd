import { createApp } from './app';
import { connectMongo, disconnectAll, prisma } from './config/db';
import { env } from './config/env';
import { ensureBucket } from './config/s3';
import { logger } from './lib/logger';

async function main() {
  await prisma.$connect();
  logger.info('MySQL connected');
  await connectMongo();
  await ensureBucket();

  const app = await createApp();
  const server = app.listen(env.PORT, () => logger.info(`API listening on :${env.PORT}`));

  // Graceful shutdown: stop accepting requests, finish in-flight ones, close DB pools.
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectAll();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
