import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { DashboardUnitOfWork } from './application/ports/dashboardUnitOfWork.port.js';
import { DashboardApplicationService } from './application/services/dashboardApplicationService.service.js';
import { GetDashboardFinancialUseCase } from './application/useCases/getDashboardFinancial.useCase.js';
import { GetDashboardSummaryUseCase } from './application/useCases/getDashboardSummary.useCase.js';
import { ListDashboardUpcomingWorkOrdersUseCase } from './application/useCases/listDashboardUpcomingWorkOrders.useCase.js';
import { PrismaDashboardUnitOfWork } from './infrastructure/transactions/prismaDashboardUnitOfWork.js';
import { DashboardController } from './presentation/http/controllers/dashboard.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [DashboardController],
  providers: [
    {
      provide: DashboardUnitOfWork,
      useClass: PrismaDashboardUnitOfWork,
    },
    {
      provide: DashboardApplicationService,
      useFactory: (unitOfWork: DashboardUnitOfWork) => new DashboardApplicationService(unitOfWork),
      inject: [DashboardUnitOfWork],
    },
    {
      provide: GetDashboardSummaryUseCase,
      useFactory: (processor: DashboardApplicationService) => new GetDashboardSummaryUseCase(processor),
      inject: [DashboardApplicationService],
    },
    {
      provide: GetDashboardFinancialUseCase,
      useFactory: (processor: DashboardApplicationService) => new GetDashboardFinancialUseCase(processor),
      inject: [DashboardApplicationService],
    },
    {
      provide: ListDashboardUpcomingWorkOrdersUseCase,
      useFactory: (processor: DashboardApplicationService) => new ListDashboardUpcomingWorkOrdersUseCase(processor),
      inject: [DashboardApplicationService],
    },
  ],
})
export class DashboardModule {}
