import { Module } from '@nestjs/common';

import { BillingWebhookWorker } from './infrastructure/workers/billingWebhook.worker.js';
import { BillingCoreModule } from './billingCore.module.js';

@Module({
  imports: [BillingCoreModule],
  providers: [BillingWebhookWorker],
})
export class BillingWorkerModule {}
