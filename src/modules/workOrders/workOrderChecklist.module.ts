import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { WorkOrderChecklistUnitOfWork } from './application/ports/workOrderChecklistUnitOfWork.port.js';
import { WorkOrderChecklistApplicationService } from './application/services/workOrderChecklistApplicationService.service.js';
import { CreateWorkOrderChecklistItemUseCase } from './application/useCases/createWorkOrderChecklistItem.useCase.js';
import { DeleteWorkOrderChecklistItemUseCase } from './application/useCases/deleteWorkOrderChecklistItem.useCase.js';
import { ListWorkOrderChecklistUseCase } from './application/useCases/listWorkOrderChecklist.useCase.js';
import { ReorderWorkOrderChecklistUseCase } from './application/useCases/reorderWorkOrderChecklist.useCase.js';
import { UpdateWorkOrderChecklistItemUseCase } from './application/useCases/updateWorkOrderChecklistItem.useCase.js';
import { PrismaWorkOrderChecklistUnitOfWork } from './infrastructure/transactions/prismaWorkOrderChecklistUnitOfWork.js';
import { WorkOrderChecklistController } from './presentation/http/controllers/workOrderChecklist.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [WorkOrderChecklistController],
  providers: [
    { provide: WorkOrderChecklistUnitOfWork, useClass: PrismaWorkOrderChecklistUnitOfWork },
    {
      provide: WorkOrderChecklistApplicationService,
      useFactory: (unitOfWork: WorkOrderChecklistUnitOfWork) => new WorkOrderChecklistApplicationService(unitOfWork),
      inject: [WorkOrderChecklistUnitOfWork],
    },
    {
      provide: ListWorkOrderChecklistUseCase,
      useFactory: (processor: WorkOrderChecklistApplicationService) => new ListWorkOrderChecklistUseCase(processor),
      inject: [WorkOrderChecklistApplicationService],
    },
    {
      provide: CreateWorkOrderChecklistItemUseCase,
      useFactory: (processor: WorkOrderChecklistApplicationService) =>
        new CreateWorkOrderChecklistItemUseCase(processor),
      inject: [WorkOrderChecklistApplicationService],
    },
    {
      provide: UpdateWorkOrderChecklistItemUseCase,
      useFactory: (processor: WorkOrderChecklistApplicationService) =>
        new UpdateWorkOrderChecklistItemUseCase(processor),
      inject: [WorkOrderChecklistApplicationService],
    },
    {
      provide: DeleteWorkOrderChecklistItemUseCase,
      useFactory: (processor: WorkOrderChecklistApplicationService) =>
        new DeleteWorkOrderChecklistItemUseCase(processor),
      inject: [WorkOrderChecklistApplicationService],
    },
    {
      provide: ReorderWorkOrderChecklistUseCase,
      useFactory: (processor: WorkOrderChecklistApplicationService) => new ReorderWorkOrderChecklistUseCase(processor),
      inject: [WorkOrderChecklistApplicationService],
    },
  ],
})
export class WorkOrderChecklistModule {}
