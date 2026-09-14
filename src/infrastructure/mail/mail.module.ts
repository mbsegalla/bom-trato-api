import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ConfigModule } from '@nestjs/config';

import { appConfig } from '../../config/app.config.js';
import { mailConfig } from '../../config/mail.config.js';

import { SmtpTransport } from './smtpTransport.js';

@Module({
  imports: [ConfigModule.forFeature(appConfig), ConfigModule.forFeature(mailConfig)],
  providers: [
    {
      provide: SmtpTransport,
      useFactory: (mail: ConfigType<typeof mailConfig>, app: ConfigType<typeof appConfig>) =>
        new SmtpTransport(mail, app),
      inject: [mailConfig.KEY, appConfig.KEY],
    },
  ],
  exports: [SmtpTransport],
})
export class MailModule {}
