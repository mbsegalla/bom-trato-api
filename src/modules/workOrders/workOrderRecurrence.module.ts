import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { WorkOrderRecurrenceRepository } from './application/ports/workOrderRecurrenceRepository.port.js';
import { ManageWorkOrderRecurrenceUseCase } from './application/useCases/manageWorkOrderRecurrence.useCase.js';
import { PrismaWorkOrderRecurrenceRepository } from './infrastructure/transactions/prismaWorkOrderRecurrenceRepository.js';
import { WorkOrderRecurrenceController } from './presentation/http/controllers/workOrderRecurrence.controller.js';
import { WorkOrderRecurrencesController } from './presentation/http/controllers/workOrderRecurrences.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [WorkOrderRecurrenceController, WorkOrderRecurrencesController],
  providers: [
    { provide: WorkOrderRecurrenceRepository, useClass: PrismaWorkOrderRecurrenceRepository },
    {
      provide: ManageWorkOrderRecurrenceUseCase,
      useFactory: (repository: WorkOrderRecurrenceRepository) => new ManageWorkOrderRecurrenceUseCase(repository),
      inject: [WorkOrderRecurrenceRepository],
    },
  ],
})
export class WorkOrderRecurrenceModule {}
