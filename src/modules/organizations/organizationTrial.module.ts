import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { BillingLock } from '../billing/application/ports/billingLock.port.js';
import { BillingCoreModule } from '../billing/billingCore.module.js';

import { OrganizationTrialActivation } from './application/ports/organizationTrialActivation.port.js';
import { StartOrganizationTrialUseCase } from './application/useCases/startOrganizationTrial.useCase.js';
import { PrismaOrganizationTrialActivation } from './infrastructure/transactions/prismaOrganizationTrialActivation.js';

@Module({
  imports: [DatabaseModule, BillingCoreModule],
  providers: [
    {
      provide: OrganizationTrialActivation,
      useClass: PrismaOrganizationTrialActivation,
    },
    {
      provide: StartOrganizationTrialUseCase,
      useFactory: (activation: OrganizationTrialActivation, billingLock: BillingLock) =>
        new StartOrganizationTrialUseCase(activation, billingLock),
      inject: [OrganizationTrialActivation, BillingLock],
    },
  ],
  exports: [StartOrganizationTrialUseCase],
})
export class OrganizationTrialModule {}
