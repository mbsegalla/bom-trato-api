import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnvironment } from './validation/env.validation.js';
import { appConfig } from './app.config.js';
import { authConfig } from './auth.config.js';
import { databaseConfig } from './database.config.js';
import { mailConfig } from './mail.config.js';
import { quoteShareConfig } from './quoteShare.config.js';
import { stripeConfig } from './stripe.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnvironment,
      load: [appConfig, databaseConfig, stripeConfig, authConfig, mailConfig, quoteShareConfig],
    }),
  ],
  exports: [ConfigModule],
})
export class ConfigurationModule {}
