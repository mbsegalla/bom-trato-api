import 'reflect-metadata';

import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { safeError } from '../../infrastructure/logging/safeError.js';
import { StartupLogger } from '../../infrastructure/logging/startupLogger.js';
import { CleanupAuthUseCase } from '../../modules/auth/application/useCases/cleanupAuth.useCase.js';

import { AuthCommandModule } from './authCommand.module.js';

const logger = new ConsoleLogger('AuthCleanup');

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AuthCommandModule, {
    logger: new StartupLogger('AuthCleanup'),
    abortOnError: false,
  });

  app.useLogger(new ConsoleLogger());

  try {
    const cleanup = app.get(CleanupAuthUseCase);

    const totals = {
      refreshTokens: 0,
      sessions: 0,
      actionTokens: 0,
      rateLimits: 0,
    };

    const now = new Date();

    for (let batch = 0; batch < 20; batch++) {
      const result = await cleanup.execute(now);

      totals.refreshTokens += result.refreshTokens;
      totals.sessions += result.sessions;
      totals.actionTokens += result.actionTokens;
      totals.rateLimits += result.rateLimits;

      if (Object.values(result).every((count) => count === 0)) {
        logger.log({
          message: 'Authentication cleanup completed',
          ...totals,
        });

        return;
      }
    }

    logger.log({
      message: 'Authentication cleanup batch limit reached; continue on the next run',
      ...totals,
    });
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  logger.error({
    message: 'Authentication cleanup failed',
    ...safeError(error),
  });

  process.exitCode = 1;
});
