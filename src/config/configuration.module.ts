import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnvironment } from './validation/env.validation.js';
import { appConfig } from './app.config.js';
import { databaseConfig } from './database.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnvironment,
      load: [appConfig, databaseConfig],
    }),
  ],
  exports: [ConfigModule],
})
export class ConfigurationModule {}