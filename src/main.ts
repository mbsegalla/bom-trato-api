import { Logger, ValidationPipe } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { appConfig } from './config/app.config.js';
import { setupSwagger } from './infrastructure/http/swagger/swagger.setup.js';
import { validationExceptionFactory } from './infrastructure/http/validation/validationException.factory.js';
import { AppModule } from './app.module.js';

const logger = new Logger('Bootstrap');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const configuration = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  app.enableShutdownHooks();

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: configuration.frontendUrl,
    credentials: true,
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

  logger.log(`Bom Trato API running on port ${configuration.port}`);

  if (configuration.swaggerEnabled) {
    logger.log(`Swagger available at http://localhost:${configuration.port}/docs`);
  }
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  logger.error(`Failed to start Bom Trato API: ${message}`, stack);

  process.exitCode = 1;
});
