import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type Stripe from 'stripe';

import { appConfig } from '../../config/app.config.js';
import { stripeConfig } from '../../config/stripe.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { BillingGateway } from './application/ports/billingGateway.port.js';
import { BillingLock } from './application/ports/billingLock.port.js';
import { PaymentMethodGateway } from './application/ports/paymentMethodGateway.port.js';
import { CreateBillingPortalUseCase } from './application/useCases/createBillingPortal.useCase.js';
import { ReadBillingUseCase } from './application/useCases/readBilling.useCase.js';
import { SetCancellationUseCase } from './application/useCases/setCancellation.useCase.js';
import { StartCheckoutUseCase } from './application/useCases/startCheckout.useCase.js';
import { SyncBillingUseCase } from './application/useCases/syncBilling.useCase.js';
import { UpdatePaymentMethodUseCase } from './application/useCases/updatePaymentMethod.useCase.js';
import { BillingRepository } from './domain/repositories/billing.repository.js';
import { PaymentMethodUpdateRepository } from './domain/repositories/paymentMethodUpdate.repository.js';
import { PostgresBillingLock } from './infrastructure/database/postgresBillingLock.js';
import { PrismaBillingRepository } from './infrastructure/repositories/prismaBilling.repository.js';
import { PrismaPaymentMethodUpdateRepository } from './infrastructure/repositories/prismaPaymentMethodUpdate.repository.js';
import { StripeBillingGateway } from './infrastructure/stripe/stripeBilling.gateway.js';
import { STRIPE_CLIENT, stripeClientProvider } from './infrastructure/stripe/stripeClient.provider.js';
import { StripePaymentMethodGateway } from './infrastructure/stripe/stripePaymentMethod.gateway.js';

@Module({
  imports: [DatabaseModule],
  providers: [
    stripeClientProvider,
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
      useFactory: (repository: BillingRepository) => new ReadBillingUseCase(repository),
      inject: [BillingRepository],
    },
    {
      provide: SetCancellationUseCase,
      useFactory: (repository: BillingRepository, gateway: BillingGateway, lock: BillingLock) =>
        new SetCancellationUseCase(repository, gateway, lock),
      inject: [BillingRepository, BillingGateway, BillingLock],
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
