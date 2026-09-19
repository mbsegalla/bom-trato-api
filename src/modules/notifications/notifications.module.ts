import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { appConfig } from '../../config/app.config.js';
import { notificationConfig } from '../../config/notification.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { NotificationOutbox } from './application/ports/notificationOutbox.port.js';
import { PrismaNotificationOutbox } from './infrastructure/repositories/prismaNotificationOutbox.js';
import { ResendEmailGateway } from './infrastructure/resend/resendEmail.gateway.js';
import { NotificationCipher } from './infrastructure/security/notificationCipher.js';
import { NotificationWorker } from './infrastructure/workers/notification.worker.js';

@Module({
  imports: [DatabaseModule, ConfigModule.forFeature(appConfig), ConfigModule.forFeature(notificationConfig)],
  providers: [
    NotificationCipher,
    PrismaNotificationOutbox,
    ResendEmailGateway,
    NotificationWorker,
    {
      provide: NotificationOutbox,
      useExisting: PrismaNotificationOutbox,
    },
  ],
  exports: [NotificationOutbox, PrismaNotificationOutbox],
})
export class NotificationsModule {}
