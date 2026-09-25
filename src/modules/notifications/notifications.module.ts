import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { appConfig } from '../../config/app.config.js';
import { databaseConfig } from '../../config/database.config.js';
import { notificationConfig } from '../../config/notification.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

import { NotificationOutbox } from './application/ports/notificationOutbox.port.js';
import { ListInAppNotificationsUseCase } from './application/useCases/listInAppNotifications.useCase.js';
import { MarkAllInAppNotificationsReadUseCase } from './application/useCases/markAllInAppNotificationsRead.useCase.js';
import { MarkInAppNotificationReadUseCase } from './application/useCases/markInAppNotificationRead.useCase.js';
import { InAppNotificationRepository } from './domain/repositories/inAppNotification.repository.js';
import { NotificationRealtimeService } from './infrastructure/realtime/notificationRealtime.service.js';
import { NotificationStreamTicketService } from './infrastructure/realtime/notificationStreamTicket.service.js';
import { PrismaInAppNotificationRepository } from './infrastructure/repositories/prismaInAppNotification.repository.js';
import { PrismaNotificationOutbox } from './infrastructure/repositories/prismaNotificationOutbox.repository.js';
import { ResendEmailGateway } from './infrastructure/resend/resendEmail.gateway.js';
import { NotificationCipher } from './infrastructure/security/notificationCipher.js';
import { NotificationWorker } from './infrastructure/workers/notification.worker.js';
import { InAppNotificationsController } from './presentation/http/controllers/inAppNotifications.controller.js';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule.forFeature(appConfig),
    ConfigModule.forFeature(databaseConfig),
    ConfigModule.forFeature(notificationConfig),
  ],
  controllers: [InAppNotificationsController],
  providers: [
    NotificationCipher,
    PrismaNotificationOutbox,
    ResendEmailGateway,
    NotificationWorker,
    NotificationRealtimeService,
    NotificationStreamTicketService,
    {
      provide: NotificationOutbox,
      useExisting: PrismaNotificationOutbox,
    },
    {
      provide: InAppNotificationRepository,
      useFactory: (prisma: PrismaService) => new PrismaInAppNotificationRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: ListInAppNotificationsUseCase,
      useFactory: (repository: InAppNotificationRepository) => new ListInAppNotificationsUseCase(repository),
      inject: [InAppNotificationRepository],
    },
    {
      provide: MarkInAppNotificationReadUseCase,
      useFactory: (repository: InAppNotificationRepository) => new MarkInAppNotificationReadUseCase(repository),
      inject: [InAppNotificationRepository],
    },
    {
      provide: MarkAllInAppNotificationsReadUseCase,
      useFactory: (repository: InAppNotificationRepository) => new MarkAllInAppNotificationsReadUseCase(repository),
      inject: [InAppNotificationRepository],
    },
  ],
  exports: [NotificationOutbox, PrismaNotificationOutbox, InAppNotificationRepository],
})
export class NotificationsModule {}
