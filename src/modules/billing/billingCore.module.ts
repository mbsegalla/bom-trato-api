import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type Stripe from 'stripe';

import { appConfig } from '../../config/app.config.js';
import { stripeConfig } from '../../config/stripe.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { BillingGateway } from './application/ports/billingGateway.port.js';
import { BillingLock } from './application/ports/billingLock.port.js';
import { PaymentMethodGateway } from './application/ports/paymentMethodGateway.port.js';
import { PlanChangeGateway } from './application/ports/planChangeGateway.port.js';
import { ChangePlanUseCase } from './application/useCases/changePlan.useCase.js';
import { CreateBillingPortalUseCase } from './application/useCases/createBillingPortal.useCase.js';
import { ReadBillingUseCase } from './application/useCases/readBilling.useCase.js';
import { SetCancellationUseCase } from './application/useCases/setCancellation.useCase.js';
import { StartCheckoutUseCase } from './application/useCases/startCheckout.useCase.js';
import { SyncBillingUseCase } from './application/useCases/syncBilling.useCase.js';
import { UpdatePaymentMethodUseCase } from './application/useCases/updatePaymentMethod.useCase.js';
import { BillingRepository } from './domain/repositories/billing.repository.js';
import { PaymentMethodUpdateRepository } from './domain/repositories/paymentMethodUpdate.repository.js';
import { PlanChangeRepository } from './domain/repositories/planChange.repository.js';
import { PostgresBillingLock } from './infrastructure/database/postgresBillingLock.js';
import { PrismaBillingRepository } from './infrastructure/repositories/prismaBilling.repository.js';
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
      provide: ChangePlanUseCase,
      useFactory: (
        billing: BillingRepository,
        changes: PlanChangeRepository,
        gateway: BillingGateway,
        planGateway: PlanChangeGateway,
        lock: BillingLock,
      ) => new ChangePlanUseCase(billing, changes, gateway, planGateway, lock),
      inject: [BillingRepository, PlanChangeRepository, BillingGateway, PlanChangeGateway, BillingLock],
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
      provide: ReadBillingUseCase,
      useFactory: (repository: BillingRepository, changes: PlanChangeRepository) =>
        new ReadBillingUseCase(repository, changes),
      inject: [BillingRepository, PlanChangeRepository],
    },
    {
      provide: SetCancellationUseCase,
      useFactory: (
        repository: BillingRepository,
        gateway: BillingGateway,
        lock: BillingLock,
        changes: PlanChangeRepository,
      ) => new SetCancellationUseCase(repository, gateway, lock, changes),
      inject: [BillingRepository, BillingGateway, BillingLock, PlanChangeRepository],
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
      provide: PaymentMethodGateway,
      useFactory: (stripe: Stripe) => new StripePaymentMethodGateway(stripe),
      inject: [STRIPE_CLIENT],
    },
    {
      provide: UpdatePaymentMethodUseCase,
      useFactory: (
        billing: BillingRepository,
        updates: PaymentMethodUpdateRepository,
        gateway: PaymentMethodGateway,
        billingGateway: BillingGateway,
        lock: BillingLock,
      ) => new UpdatePaymentMethodUseCase(billing, updates, gateway, billingGateway, lock),
      inject: [BillingRepository, PaymentMethodUpdateRepository, PaymentMethodGateway, BillingGateway, BillingLock],
    },
  ],
  exports: [
    PlanChangeRepository,
    ChangePlanUseCase,
    BillingRepository,
    BillingGateway,
    BillingLock,
    StartCheckoutUseCase,
    ReadBillingUseCase,
    SetCancellationUseCase,
    SyncBillingUseCase,
    CreateBillingPortalUseCase,
    PaymentMethodUpdateRepository,
    UpdatePaymentMethodUseCase,
  ],
})
export class BillingCoreModule {}
