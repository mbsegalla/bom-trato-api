import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

import { appConfig } from './config/app.config.js';
import { requestCorrelationMiddleware } from './infrastructure/http/middleware/requestCorrelation.middleware.js';
import { setupSwagger } from './infrastructure/http/swagger/swagger.setup.js';
import { validationExceptionFactory } from './infrastructure/http/validation/validationException.factory.js';
import { safeError } from './infrastructure/logging/safeError.js';
import { StartupLogger } from './infrastructure/logging/startupLogger.js';
import { AppModule } from './app.module.js';

const logger = new ConsoleLogger('Bootstrap');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: new StartupLogger('Bootstrap'),
    abortOnError: false,
  });

  try {
    const configuration = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

    app.set('trust proxy', configuration.trustProxy.length > 0 ? configuration.trustProxy : false);

    app.enableShutdownHooks();

    app.setGlobalPrefix('api');

    app.use(requestCorrelationMiddleware);

    app.use(cookieParser());

    app.enableCors({
      origin: configuration.frontendUrl,
      credentials: true,
      exposedHeaders: ['X-Request-Id', 'Retry-After'],
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: validationExceptionFactory,
        validationError: {
          target: false,
          value: false,
        },
      }),
    );

    if (configuration.swaggerEnabled) {
      setupSwagger(app);
    }

    await app.listen(configuration.port, '0.0.0.0');

    app.useLogger(new ConsoleLogger());

    logger.log(`Bom Trato API running on port ${configuration.port}`);

    if (configuration.swaggerEnabled) {
      logger.log(`Swagger available at http://localhost:${configuration.port}/docs`);
    }
  } catch (error: unknown) {
    try {
      await app.close();
    } catch (closeError: unknown) {
      logger.error({
        message: 'Failed to close application after startup failure',
        ...safeError(closeError),
      });
    }

    throw error;
  }
}

bootstrap().catch((error: unknown) => {
  logger.error({
    message: 'Failed to start Bom Trato API',
    ...safeError(error),
  });

  process.exitCode = 1;
});
