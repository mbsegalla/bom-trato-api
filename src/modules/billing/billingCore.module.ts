import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type Stripe from 'stripe';

import { appConfig } from '../../config/app.config.js';
import { stripeConfig } from '../../config/stripe.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { BillingGateway } from './application/ports/billingGateway.port.js';
import { BillingLock } from './application/ports/billingLock.port.js';
import { BillingWebhookRepository } from './application/ports/billingWebhookRepository.port.js';
import { PaymentMethodGateway } from './application/ports/paymentMethodGateway.port.js';
import { PlanChangeGateway } from './application/ports/planChangeGateway.port.js';
import { PaymentMethodUpdateProcessor } from './application/services/paymentMethodUpdateProcessor.service.js';
import { PlanChangeProcessor } from './application/services/planChangeProcessor.service.js';
import { SubscriptionCancellationService } from './application/services/subscriptionCancellationService.service.js';
import { CancelPlanChangeUseCase } from './application/useCases/cancelPlanChange.useCase.js';
import { CancelSubscriptionUseCase } from './application/useCases/cancelSubscription.useCase.js';
import { CompletePaymentMethodUpdateUseCase } from './application/useCases/completePaymentMethodUpdate.useCase.js';
import { ConfirmPlanChangeUseCase } from './application/useCases/confirmPlanChange.useCase.js';
import { CreateBillingPortalUseCase } from './application/useCases/createBillingPortal.useCase.js';
import { GetEntitlementsUseCase } from './application/useCases/getEntitlements.useCase.js';
import { GetPaymentMethodUseCase } from './application/useCases/getPaymentMethod.useCase.js';
import { GetPlanChangeUseCase } from './application/useCases/getPlanChange.useCase.js';
import { GetSubscriptionUseCase } from './application/useCases/getSubscription.useCase.js';
import { ListBillingInvoicesUseCase } from './application/useCases/listBillingInvoices.useCase.js';
import { PreviewPlanChangeUseCase } from './application/useCases/previewPlanChange.useCase.js';
import { ReconcilePlanChangeUseCase } from './application/useCases/reconcilePlanChange.useCase.js';
import { ResumeSubscriptionUseCase } from './application/useCases/resumeSubscription.useCase.js';
import { StartCheckoutUseCase } from './application/useCases/startCheckout.useCase.js';
import { StartPaymentMethodUpdateUseCase } from './application/useCases/startPaymentMethodUpdate.useCase.js';
import { SyncBillingUseCase } from './application/useCases/syncBilling.useCase.js';
import { SyncPaymentMethodUpdateUseCase } from './application/useCases/syncPaymentMethodUpdate.useCase.js';
import { SyncPlanChangeUseCase } from './application/useCases/syncPlanChange.useCase.js';
import { BillingRepository } from './domain/repositories/billing.repository.js';
import { PaymentMethodUpdateRepository } from './domain/repositories/paymentMethodUpdate.repository.js';
import { PlanChangeRepository } from './domain/repositories/planChange.repository.js';
import { PostgresBillingLock } from './infrastructure/database/postgresBillingLock.js';
import { BillingWorkerNotifier } from './infrastructure/events/billingWorkerNotifier.service.js';
import { PrismaBillingRepository } from './infrastructure/repositories/prismaBilling.repository.js';
import { PrismaBillingWebhookRepository } from './infrastructure/repositories/prismaBillingWebhook.repository.js';
import { PrismaPaymentMethodUpdateRepository } from './infrastructure/repositories/prismaPaymentMethodUpdate.repository.js';
import { PrismaPlanChangeRepository } from './infrastructure/repositories/prismaPlanChange.repository.js';
import { StripeBillingGateway } from './infrastructure/stripe/stripeBilling.gateway.js';
import { STRIPE_CLIENT, stripeClientProvider } from './infrastructure/stripe/stripeClient.provider.js';
import { StripePaymentMethodGateway } from './infrastructure/stripe/stripePaymentMethod.gateway.js';
import { StripePlanChangeGateway } from './infrastructure/stripe/stripePlanChange.gateway.js';

@Module({
  imports: [DatabaseModule],
  providers: [
    stripeClientProvider,
    BillingWorkerNotifier,
    {
      provide: PlanChangeRepository,
      useClass: PrismaPlanChangeRepository,
    },
    {
      provide: PlanChangeGateway,
      useFactory: (stripe: Stripe) => new StripePlanChangeGateway(stripe),
      inject: [STRIPE_CLIENT],
    },
    {
      provide: PlanChangeProcessor,
      useFactory: (
        billing: BillingRepository,
        changes: PlanChangeRepository,
        gateway: BillingGateway,
        planGateway: PlanChangeGateway,
      ) => new PlanChangeProcessor(billing, changes, gateway, planGateway),
      inject: [BillingRepository, PlanChangeRepository, BillingGateway, PlanChangeGateway],
    },
    {
      provide: PreviewPlanChangeUseCase,
      useFactory: (
        billing: BillingRepository,
        changes: PlanChangeRepository,
        gateway: BillingGateway,
        planGateway: PlanChangeGateway,
        lock: BillingLock,
      ) => new PreviewPlanChangeUseCase(billing, changes, gateway, planGateway, lock),
      inject: [BillingRepository, PlanChangeRepository, BillingGateway, PlanChangeGateway, BillingLock],
    },
    {
      provide: ConfirmPlanChangeUseCase,
      useFactory: (
        billing: BillingRepository,
        changes: PlanChangeRepository,
        gateway: BillingGateway,
        planGateway: PlanChangeGateway,
        lock: BillingLock,
        processor: PlanChangeProcessor,
      ) => new ConfirmPlanChangeUseCase(billing, changes, gateway, planGateway, lock, processor),
      inject: [
        BillingRepository,
        PlanChangeRepository,
        BillingGateway,
        PlanChangeGateway,
        BillingLock,
        PlanChangeProcessor,
      ],
    },
    {
      provide: GetPlanChangeUseCase,
      useFactory: (planGateway: PlanChangeGateway, processor: PlanChangeProcessor) =>
        new GetPlanChangeUseCase(planGateway, processor),
      inject: [PlanChangeGateway, PlanChangeProcessor],
    },
    {
      provide: SyncPlanChangeUseCase,
      useFactory: (billing: BillingRepository, lock: BillingLock, processor: PlanChangeProcessor) =>
        new SyncPlanChangeUseCase(billing, lock, processor),
      inject: [BillingRepository, BillingLock, PlanChangeProcessor],
    },
    {
      provide: CancelPlanChangeUseCase,
      useFactory: (
        billing: BillingRepository,
        changes: PlanChangeRepository,
        planGateway: PlanChangeGateway,
        lock: BillingLock,
        processor: PlanChangeProcessor,
      ) => new CancelPlanChangeUseCase(billing, changes, planGateway, lock, processor),
      inject: [BillingRepository, PlanChangeRepository, PlanChangeGateway, BillingLock, PlanChangeProcessor],
    },
    {
      provide: ReconcilePlanChangeUseCase,
      useFactory: (changes: PlanChangeRepository, lock: BillingLock, processor: PlanChangeProcessor) =>
        new ReconcilePlanChangeUseCase(changes, lock, processor),
      inject: [PlanChangeRepository, BillingLock, PlanChangeProcessor],
    },

    {
      provide: BillingRepository,
      useClass: PrismaBillingRepository,
    },
    {
      provide: BillingLock,
      useClass: PostgresBillingLock,
    },
    {
      provide: BillingGateway,
      useFactory: (stripe: Stripe, config: ConfigType<typeof stripeConfig>) =>
        new StripeBillingGateway(stripe, config.webhookSecret, config.portalConfigurationId),
      inject: [STRIPE_CLIENT, stripeConfig.KEY],
    },
    {
      provide: CreateBillingPortalUseCase,
      useFactory: (repository: BillingRepository, gateway: BillingGateway, config: ConfigType<typeof appConfig>) =>
        new CreateBillingPortalUseCase(repository, gateway, config.frontendUrl),
      inject: [BillingRepository, BillingGateway, appConfig.KEY],
    },
    {
      provide: StartCheckoutUseCase,
      useFactory: (
        repository: BillingRepository,
        gateway: BillingGateway,
        lock: BillingLock,
        config: ConfigType<typeof appConfig>,
      ) => new StartCheckoutUseCase(repository, gateway, lock, config.frontendUrl),
      inject: [BillingRepository, BillingGateway, BillingLock, appConfig.KEY],
    },
    {
      provide: GetSubscriptionUseCase,
      useFactory: (repository: BillingRepository) => new GetSubscriptionUseCase(repository),
      inject: [BillingRepository],
    },
    {
      provide: GetEntitlementsUseCase,
      useFactory: (repository: BillingRepository, changes: PlanChangeRepository) =>
        new GetEntitlementsUseCase(repository, changes),
      inject: [BillingRepository, PlanChangeRepository],
    },
    {
      provide: ListBillingInvoicesUseCase,
      useFactory: (repository: BillingRepository) => new ListBillingInvoicesUseCase(repository),
      inject: [BillingRepository],
    },
    {
      provide: SubscriptionCancellationService,
      useFactory: (
        repository: BillingRepository,
        gateway: BillingGateway,
        lock: BillingLock,
        changes: PlanChangeRepository,
      ) => new SubscriptionCancellationService(repository, gateway, lock, changes),
      inject: [BillingRepository, BillingGateway, BillingLock, PlanChangeRepository],
    },
    {
      provide: CancelSubscriptionUseCase,
      useFactory: (processor: SubscriptionCancellationService) => new CancelSubscriptionUseCase(processor),
      inject: [SubscriptionCancellationService],
    },
    {
      provide: ResumeSubscriptionUseCase,
      useFactory: (processor: SubscriptionCancellationService) => new ResumeSubscriptionUseCase(processor),
      inject: [SubscriptionCancellationService],
    },
    {
      provide: SyncBillingUseCase,
      useFactory: (repository: BillingRepository, gateway: BillingGateway, lock: BillingLock) =>
        new SyncBillingUseCase(repository, gateway, lock),
      inject: [BillingRepository, BillingGateway, BillingLock],
    },

    {
      provide: PaymentMethodUpdateRepository,
      useClass: PrismaPaymentMethodUpdateRepository,
    },
    {
      provide: BillingWebhookRepository,
      useClass: PrismaBillingWebhookRepository,
    },
    {
      provide: PaymentMethodGateway,
      useFactory: (stripe: Stripe) => new StripePaymentMethodGateway(stripe),
      inject: [STRIPE_CLIENT],
    },
    {
      provide: PaymentMethodUpdateProcessor,
      useFactory: (billing: BillingRepository, updates: PaymentMethodUpdateRepository, gateway: PaymentMethodGateway) =>
        new PaymentMethodUpdateProcessor(billing, updates, gateway),
      inject: [BillingRepository, PaymentMethodUpdateRepository, PaymentMethodGateway],
    },
    {
      provide: StartPaymentMethodUpdateUseCase,
      useFactory: (
        billing: BillingRepository,
        updates: PaymentMethodUpdateRepository,
        billingGateway: BillingGateway,
        lock: BillingLock,
        processor: PaymentMethodUpdateProcessor,
      ) => new StartPaymentMethodUpdateUseCase(billing, updates, billingGateway, lock, processor),
      inject: [
        BillingRepository,
        PaymentMethodUpdateRepository,
        BillingGateway,
        BillingLock,
        PaymentMethodUpdateProcessor,
      ],
    },
    {
      provide: CompletePaymentMethodUpdateUseCase,
      useFactory: (
        billing: BillingRepository,
        updates: PaymentMethodUpdateRepository,
        lock: BillingLock,
        processor: PaymentMethodUpdateProcessor,
      ) => new CompletePaymentMethodUpdateUseCase(billing, updates, lock, processor),
      inject: [BillingRepository, PaymentMethodUpdateRepository, BillingLock, PaymentMethodUpdateProcessor],
    },
    {
      provide: GetPaymentMethodUseCase,
      useFactory: (billing: BillingRepository, gateway: PaymentMethodGateway) =>
        new GetPaymentMethodUseCase(billing, gateway),
      inject: [BillingRepository, PaymentMethodGateway],
    },
    {
      provide: SyncPaymentMethodUpdateUseCase,
      useFactory: (
        updates: PaymentMethodUpdateRepository,
        lock: BillingLock,
        processor: PaymentMethodUpdateProcessor,
      ) => new SyncPaymentMethodUpdateUseCase(updates, lock, processor),
      inject: [PaymentMethodUpdateRepository, BillingLock, PaymentMethodUpdateProcessor],
    },
  ],
  exports: [
    PlanChangeRepository,
    PreviewPlanChangeUseCase,
    ConfirmPlanChangeUseCase,
    GetPlanChangeUseCase,
    SyncPlanChangeUseCase,
    CancelPlanChangeUseCase,
    ReconcilePlanChangeUseCase,
    BillingRepository,
    BillingWebhookRepository,
    BillingGateway,
    BillingLock,
    StartCheckoutUseCase,
    GetSubscriptionUseCase,
    GetEntitlementsUseCase,
    ListBillingInvoicesUseCase,
    CancelSubscriptionUseCase,
    ResumeSubscriptionUseCase,
    SyncBillingUseCase,
    CreateBillingPortalUseCase,
    PaymentMethodUpdateRepository,
    StartPaymentMethodUpdateUseCase,
    CompletePaymentMethodUpdateUseCase,
    GetPaymentMethodUseCase,
    SyncPaymentMethodUpdateUseCase,
  ],
})
export class BillingCoreModule {}
