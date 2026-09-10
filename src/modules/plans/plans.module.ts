import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { ListPlansUseCase } from './application/useCases/listPlans.useCase.js';
import { PlanRepository } from './domain/repositories/plan.repository.js';
import { PrismaPlanRepository } from './infrastructure/repositories/prismaPlan.repository.js';
import { PlansController } from './presentation/http/controller/plans.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [PlansController],
  providers: [
    {
      provide: PlanRepository,
      useClass: PrismaPlanRepository,
    },
    {
      provide: ListPlansUseCase,
      useFactory: (planRepository: PlanRepository) => new ListPlansUseCase(planRepository),
      inject: [PlanRepository],
    },
  ],
})
export class PlansModule {}
