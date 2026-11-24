import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { BillingGateway } from '../billing/application/ports/billingGateway.port.js';
import { BillingLock } from '../billing/application/ports/billingLock.port.js';
import { UpdateBillingCustomerNameUseCase } from '../billing/application/useCases/updateBillingCustomerName.useCase.js';
import { BillingCoreModule } from '../billing/billingCore.module.js';
import { BillingRepository } from '../billing/domain/repositories/billing.repository.js';
import { StartOrganizationTrialUseCase } from '../organizations/application/useCases/startOrganizationTrial.useCase.js';
import { OrganizationTrialModule } from '../organizations/organizationTrial.module.js';

import { OnboardingApplicationService } from './application/services/onboardingApplicationService.service.js';
import { BootstrapOnboardingUseCase } from './application/useCases/bootstrapOnboarding.useCase.js';
import { CompleteOnboardingBusinessUseCase } from './application/useCases/completeOnboardingBusiness.useCase.js';
import { GetOnboardingStateUseCase } from './application/useCases/getOnboardingState.useCase.js';
import { SelectOnboardingPlanUseCase } from './application/useCases/selectOnboardingPlan.useCase.js';
import { OnboardingRepository } from './domain/repositories/onboarding.repository.js';
import { PrismaOnboardingRepository } from './infrastructure/repositories/prismaOnboarding.repository.js';
import { OnboardingController } from './presentation/http/controllers/onboarding.controller.js';

@Module({
  imports: [DatabaseModule, BillingCoreModule, OrganizationTrialModule],
  controllers: [OnboardingController],
  providers: [
    {
      provide: OnboardingRepository,
      useClass: PrismaOnboardingRepository,
    },
    {
      provide: OnboardingApplicationService,
      useFactory: (repository: OnboardingRepository) => new OnboardingApplicationService(repository),
      inject: [OnboardingRepository],
    },
    {
      provide: BootstrapOnboardingUseCase,
      useFactory: (repository: OnboardingRepository, service: OnboardingApplicationService) =>
        new BootstrapOnboardingUseCase(repository, service),
      inject: [OnboardingRepository, OnboardingApplicationService],
    },
    {
      provide: GetOnboardingStateUseCase,
      useFactory: (service: OnboardingApplicationService) => new GetOnboardingStateUseCase(service),
      inject: [OnboardingApplicationService],
    },
    {
      provide: SelectOnboardingPlanUseCase,
      useFactory: (
        repository: OnboardingRepository,
        service: OnboardingApplicationService,
        billingRepository: BillingRepository,
        billingGateway: BillingGateway,
        billingLock: BillingLock,
      ) => new SelectOnboardingPlanUseCase(repository, service, billingRepository, billingGateway, billingLock),
      inject: [OnboardingRepository, OnboardingApplicationService, BillingRepository, BillingGateway, BillingLock],
    },
    {
      provide: CompleteOnboardingBusinessUseCase,
      useFactory: (
        repository: OnboardingRepository,
        service: OnboardingApplicationService,
        updateBillingCustomerNameUseCase: UpdateBillingCustomerNameUseCase,
        startOrganizationTrialUseCase: StartOrganizationTrialUseCase,
        billingRepository: BillingRepository,
      ) =>
        new CompleteOnboardingBusinessUseCase(
          repository,
          service,
          updateBillingCustomerNameUseCase,
          startOrganizationTrialUseCase,
          billingRepository,
        ),
      inject: [
        OnboardingRepository,
        OnboardingApplicationService,
        UpdateBillingCustomerNameUseCase,
        StartOrganizationTrialUseCase,
        BillingRepository,
      ],
    },
  ],
})
export class OnboardingModule {}
