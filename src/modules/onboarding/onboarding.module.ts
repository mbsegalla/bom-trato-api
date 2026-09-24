import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { UpdateBillingCustomerNameUseCase } from '../billing/application/useCases/updateBillingCustomerName.useCase.js';
import { BillingCoreModule } from '../billing/billingCore.module.js';

import { OnboardingApplicationService } from './application/services/onboardingApplicationService.service.js';
import { BootstrapOnboardingUseCase } from './application/useCases/bootstrapOnboarding.useCase.js';
import { CompleteOnboardingBusinessUseCase } from './application/useCases/completeOnboardingBusiness.useCase.js';
import { GetOnboardingStateUseCase } from './application/useCases/getOnboardingState.useCase.js';
import { SelectOnboardingPlanUseCase } from './application/useCases/selectOnboardingPlan.useCase.js';
import { OnboardingRepository } from './domain/repositories/onboarding.repository.js';
import { PrismaOnboardingRepository } from './infrastructure/repositories/prismaOnboarding.repository.js';
import { OnboardingController } from './presentation/http/controllers/onboarding.controller.js';

@Module({
  imports: [DatabaseModule, BillingCoreModule],
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
      useFactory: (repository: OnboardingRepository, service: OnboardingApplicationService) =>
        new SelectOnboardingPlanUseCase(repository, service),
      inject: [OnboardingRepository, OnboardingApplicationService],
    },
    {
      provide: CompleteOnboardingBusinessUseCase,
      useFactory: (
        repository: OnboardingRepository,
        service: OnboardingApplicationService,
        updateBillingCustomerNameUseCase: UpdateBillingCustomerNameUseCase,
      ) => new CompleteOnboardingBusinessUseCase(repository, service, updateBillingCustomerNameUseCase),
      inject: [OnboardingRepository, OnboardingApplicationService, UpdateBillingCustomerNameUseCase],
    },
  ],
})
export class OnboardingModule {}
