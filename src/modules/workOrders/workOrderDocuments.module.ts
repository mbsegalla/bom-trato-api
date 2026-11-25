import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { WorkOrderDocumentPdfGenerator } from './application/ports/workOrderDocumentPdfGenerator.port.js';
import { WorkOrderDocumentRepository } from './application/ports/workOrderDocumentRepository.port.js';
import { GenerateWorkOrderReportUseCase } from './application/useCases/generateWorkOrderReport.useCase.js';
import { GetWorkOrderWarrantyUseCase } from './application/useCases/getWorkOrderWarranty.useCase.js';
import { UpdateWorkOrderWarrantyUseCase } from './application/useCases/updateWorkOrderWarranty.useCase.js';
import { PdfKitWorkOrderDocumentGenerator } from './infrastructure/pdf/pdfKitWorkOrderDocumentGenerator.js';
import { PrismaWorkOrderDocumentRepository } from './infrastructure/transactions/prismaWorkOrderDocumentRepository.js';
import { WorkOrderDocumentsController } from './presentation/http/controllers/workOrderDocuments.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [WorkOrderDocumentsController],
  providers: [
    { provide: WorkOrderDocumentRepository, useClass: PrismaWorkOrderDocumentRepository },
    { provide: WorkOrderDocumentPdfGenerator, useClass: PdfKitWorkOrderDocumentGenerator },
    {
      provide: GetWorkOrderWarrantyUseCase,
      useFactory: (repository: WorkOrderDocumentRepository) => new GetWorkOrderWarrantyUseCase(repository),
      inject: [WorkOrderDocumentRepository],
    },
    {
      provide: UpdateWorkOrderWarrantyUseCase,
      useFactory: (repository: WorkOrderDocumentRepository) => new UpdateWorkOrderWarrantyUseCase(repository),
      inject: [WorkOrderDocumentRepository],
    },
    {
      provide: GenerateWorkOrderReportUseCase,
      useFactory: (repository: WorkOrderDocumentRepository, generator: WorkOrderDocumentPdfGenerator) =>
        new GenerateWorkOrderReportUseCase(repository, generator),
      inject: [WorkOrderDocumentRepository, WorkOrderDocumentPdfGenerator],
    },
  ],
  exports: [WorkOrderDocumentPdfGenerator],
})
export class WorkOrderDocumentsModule {}
