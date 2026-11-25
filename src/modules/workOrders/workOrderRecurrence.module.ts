import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { appConfig } from '../../config/app.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { WorkOrderRecurrenceGeneration } from './application/ports/workOrderRecurrenceGeneration.port.js';
import { WorkOrderRecurrenceRepository } from './application/ports/workOrderRecurrenceRepository.port.js';
import { GenerateWorkOrderRecurrenceUseCase } from './application/useCases/generateWorkOrderRecurrence.useCase.js';
import { ManageWorkOrderRecurrenceUseCase } from './application/useCases/manageWorkOrderRecurrence.useCase.js';
import { PrismaWorkOrderRecurrenceGeneration } from './infrastructure/transactions/prismaWorkOrderRecurrenceGeneration.js';
import { PrismaWorkOrderRecurrenceRepository } from './infrastructure/transactions/prismaWorkOrderRecurrenceRepository.js';
import { WorkOrderRecurrenceWorker } from './infrastructure/workers/workOrderRecurrence.worker.js';
import { WorkOrderRecurrenceController } from './presentation/http/controllers/workOrderRecurrence.controller.js';
import { WorkOrderRecurrencesController } from './presentation/http/controllers/workOrderRecurrences.controller.js';

@Module({
  imports: [DatabaseModule, ConfigModule.forFeature(appConfig)],
  controllers: [WorkOrderRecurrenceController, WorkOrderRecurrencesController],
  providers: [
    WorkOrderRecurrenceWorker,
    { provide: WorkOrderRecurrenceGeneration, useClass: PrismaWorkOrderRecurrenceGeneration },
    {
      provide: GenerateWorkOrderRecurrenceUseCase,
      useFactory: (generation: WorkOrderRecurrenceGeneration) => new GenerateWorkOrderRecurrenceUseCase(generation),
      inject: [WorkOrderRecurrenceGeneration],
    },
    { provide: WorkOrderRecurrenceRepository, useClass: PrismaWorkOrderRecurrenceRepository },
    {
      provide: ManageWorkOrderRecurrenceUseCase,
      useFactory: (repository: WorkOrderRecurrenceRepository) => new ManageWorkOrderRecurrenceUseCase(repository),
      inject: [WorkOrderRecurrenceRepository],
    },
  ],
})
export class WorkOrderRecurrenceModule {}
