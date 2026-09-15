import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { WorkOrderUnitOfWork } from './application/ports/workOrderUnitOfWork.port.js';
import { WorkOrderApplicationService } from './application/services/workOrderApplicationService.service.js';
import { AssignWorkOrderUseCase } from './application/useCases/assignWorkOrder.useCase.js';
import { CancelWorkOrderUseCase } from './application/useCases/cancelWorkOrder.useCase.js';
import { CompleteWorkOrderUseCase } from './application/useCases/completeWorkOrder.useCase.js';
import { CreateWorkOrderUseCase } from './application/useCases/createWorkOrder.useCase.js';
import { GetWorkOrderUseCase } from './application/useCases/getWorkOrder.useCase.js';
import { ListWorkOrdersUseCase } from './application/useCases/listWorkOrders.useCase.js';
import { ListWorkOrderScheduleUseCase } from './application/useCases/listWorkOrderSchedule.useCase.js';
import { ListWorkOrderScheduleHistoryUseCase } from './application/useCases/listWorkOrderScheduleHistory.useCase.js';
import { ListWorkOrderStatusHistoryUseCase } from './application/useCases/listWorkOrderStatusHistory.useCase.js';
import { ScheduleWorkOrderUseCase } from './application/useCases/scheduleWorkOrder.useCase.js';
import { StartWorkOrderUseCase } from './application/useCases/startWorkOrder.useCase.js';
import { UpdateWorkOrderUseCase } from './application/useCases/updateWorkOrder.useCase.js';
import { UpdateWorkOrderExecutionNotesUseCase } from './application/useCases/updateWorkOrderExecutionNotes.useCase.js';
import { PrismaWorkOrderUnitOfWork } from './infrastructure/transactions/prismaWorkOrderUnitOfWork.js';
import { WorkOrdersController } from './presentation/http/controllers/workOrders.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [WorkOrdersController],
  providers: [
    {
      provide: WorkOrderUnitOfWork,
      useClass: PrismaWorkOrderUnitOfWork,
    },
    {
      provide: WorkOrderApplicationService,
      useFactory: (unitOfWork: WorkOrderUnitOfWork) => new WorkOrderApplicationService(unitOfWork),
      inject: [WorkOrderUnitOfWork],
    },
    {
      provide: CreateWorkOrderUseCase,
      useFactory: (processor: WorkOrderApplicationService) => new CreateWorkOrderUseCase(processor),
      inject: [WorkOrderApplicationService],
    },
    {
      provide: ListWorkOrdersUseCase,
      useFactory: (processor: WorkOrderApplicationService) => new ListWorkOrdersUseCase(processor),
      inject: [WorkOrderApplicationService],
    },
    {
      provide: GetWorkOrderUseCase,
      useFactory: (processor: WorkOrderApplicationService) => new GetWorkOrderUseCase(processor),
      inject: [WorkOrderApplicationService],
    },
    {
      provide: UpdateWorkOrderUseCase,
      useFactory: (processor: WorkOrderApplicationService) => new UpdateWorkOrderUseCase(processor),
      inject: [WorkOrderApplicationService],
    },
    {
      provide: AssignWorkOrderUseCase,
      useFactory: (processor: WorkOrderApplicationService) => new AssignWorkOrderUseCase(processor),
      inject: [WorkOrderApplicationService],
    },
    {
      provide: ScheduleWorkOrderUseCase,
      useFactory: (processor: WorkOrderApplicationService) => new ScheduleWorkOrderUseCase(processor),
      inject: [WorkOrderApplicationService],
    },
    {
      provide: StartWorkOrderUseCase,
      useFactory: (processor: WorkOrderApplicationService) => new StartWorkOrderUseCase(processor),
      inject: [WorkOrderApplicationService],
    },
    {
      provide: UpdateWorkOrderExecutionNotesUseCase,
      useFactory: (processor: WorkOrderApplicationService) => new UpdateWorkOrderExecutionNotesUseCase(processor),
      inject: [WorkOrderApplicationService],
    },
    {
      provide: CompleteWorkOrderUseCase,
      useFactory: (processor: WorkOrderApplicationService) => new CompleteWorkOrderUseCase(processor),
      inject: [WorkOrderApplicationService],
    },
    {
      provide: CancelWorkOrderUseCase,
      useFactory: (processor: WorkOrderApplicationService) => new CancelWorkOrderUseCase(processor),
      inject: [WorkOrderApplicationService],
    },
    {
      provide: ListWorkOrderStatusHistoryUseCase,
      useFactory: (processor: WorkOrderApplicationService) => new ListWorkOrderStatusHistoryUseCase(processor),
      inject: [WorkOrderApplicationService],
    },
    {
      provide: ListWorkOrderScheduleUseCase,
      useFactory: (processor: WorkOrderApplicationService) => new ListWorkOrderScheduleUseCase(processor),
      inject: [WorkOrderApplicationService],
    },
    {
      provide: ListWorkOrderScheduleHistoryUseCase,
      useFactory: (processor: WorkOrderApplicationService) => new ListWorkOrderScheduleHistoryUseCase(processor),
      inject: [WorkOrderApplicationService],
    },
  ],
})
export class WorkOrdersModule {}
