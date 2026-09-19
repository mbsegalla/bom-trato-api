import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { NotificationOutbox } from '../notifications/application/ports/notificationOutbox.port.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

import { BillingSuccessNotificationUnitOfWork } from './application/ports/prismaBillingSuccessNotificationUnitOfWork.port.js';
import { QueueBillingAlertUseCase } from './application/useCases/queueBillingAlert.useCase.js';
import { QueueNextBillingConfirmationUseCase } from './application/useCases/queueNextBillingConfirmation.useCase.js';
import { BillingRepository } from './domain/repositories/billing.repository.js';
import { PrismaBillingSuccessNotificationUnitOfWork } from './infrastructure/transactions/prismaBillingSuccessNotificationUnitOfWork.js';
import { BillingWebhookWorker } from './infrastructure/workers/billingWebhook.worker.js';
import { BillingCoreModule } from './billingCore.module.js';

@Module({
  imports: [BillingCoreModule, DatabaseModule, NotificationsModule],
  providers: [
    BillingWebhookWorker,
    {
      provide: BillingSuccessNotificationUnitOfWork,
      useClass: PrismaBillingSuccessNotificationUnitOfWork,
    },
    {
      provide: QueueNextBillingConfirmationUseCase,
      useFactory: (unitOfWork: BillingSuccessNotificationUnitOfWork) =>
        new QueueNextBillingConfirmationUseCase(unitOfWork),
      inject: [BillingSuccessNotificationUnitOfWork],
    },
    {
      provide: QueueBillingAlertUseCase,
      useFactory: (repository: BillingRepository, notifications: NotificationOutbox) =>
        new QueueBillingAlertUseCase(repository, notifications),
      inject: [BillingRepository, NotificationOutbox],
    },
  ],
})
export class BillingWorkerModule {}
