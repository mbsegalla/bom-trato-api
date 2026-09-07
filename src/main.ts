import type { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { appConfig } from './config/app.config.js';
import { setupSwagger } from './infrastructure/http/swagger/swagger.setup.js';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const configuration = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  app.enableCors({
    origin: configuration.frontendUrl,
  });

  if (configuration.swaggerEnabled) {
    setupSwagger(app);
  }

  await app.listen(configuration.port);
}

await bootstrap();