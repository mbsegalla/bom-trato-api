import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { WorkOrderAcceptanceUnitOfWork } from './application/ports/workOrderAcceptanceUnitOfWork.port.js';
import { GetWorkOrderAcceptanceUseCase } from './application/useCases/getWorkOrderAcceptance.useCase.js';
import { PrismaWorkOrderAcceptanceUnitOfWork } from './infrastructure/transactions/prismaWorkOrderAcceptanceUnitOfWork.js';
import { WorkOrderAcceptanceController } from './presentation/http/controllers/workOrderAcceptance.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [WorkOrderAcceptanceController],
  providers: [
    { provide: WorkOrderAcceptanceUnitOfWork, useClass: PrismaWorkOrderAcceptanceUnitOfWork },
    {
      provide: GetWorkOrderAcceptanceUseCase,
      useFactory: (unitOfWork: WorkOrderAcceptanceUnitOfWork) => new GetWorkOrderAcceptanceUseCase(unitOfWork),
      inject: [WorkOrderAcceptanceUnitOfWork],
    },
  ],
})
export class WorkOrderAcceptanceModule {}
