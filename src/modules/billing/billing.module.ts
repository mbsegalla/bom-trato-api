import { Module } from '@nestjs/common';

import { BillingController } from './presentation/http/controllers/billing.controller.js';
import { PaymentMethodController } from './presentation/http/controllers/paymentMethod.controller.js';
import { PlanChangeController } from './presentation/http/controllers/planChange.controller.js';
import { StripeWebhookController } from './presentation/http/controllers/stripeWebhook.controller.js';
import { SubscriptionAccessGuard } from './presentation/http/guards/subscriptionAccess.guard.js';
import { BillingCoreModule } from './billingCore.module.js';

@Module({
  imports: [BillingCoreModule],
  controllers: [PlanChangeController, BillingController, StripeWebhookController, PaymentMethodController],
  providers: [SubscriptionAccessGuard],
  exports: [SubscriptionAccessGuard],
})
export class BillingModule {}
