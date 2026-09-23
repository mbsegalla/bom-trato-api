import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { OnboardingService } from './application/services/onboarding.service.js';
import { OnboardingRepository } from './domain/repositories/onboarding.repository.js';
import { PrismaOnboardingRepository } from './infrastructure/repositories/prismaOnboarding.repository.js';
import { OnboardingController } from './presentation/http/controller/onboarding.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [OnboardingController],
  providers: [
    {
      provide: OnboardingRepository,
      useClass: PrismaOnboardingRepository,
    },
    {
      provide: OnboardingService,
      useFactory: (repository: OnboardingRepository) => new OnboardingService(repository),
      inject: [OnboardingRepository],
    },
  ],
})
export class OnboardingModule {}
