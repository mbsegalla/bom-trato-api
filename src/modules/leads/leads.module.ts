import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { LeadUnitOfWork } from './application/ports/leadUnitOfWork.port.js';
import { LeadApplicationService } from './application/services/leadApplicationService.service.js';
import { ArchiveLeadUseCase } from './application/useCases/archiveLead.useCase.js';
import { ConvertLeadUseCase } from './application/useCases/convertLead.useCase.js';
import { CreatePublicLeadUseCase } from './application/useCases/createPublicLead.useCase.js';
import { GetLeadUseCase } from './application/useCases/getLead.useCase.js';
import { ListLeadsUseCase } from './application/useCases/listLeads.useCase.js';
import { MarkLeadContactedUseCase } from './application/useCases/markLeadContacted.useCase.js';
import { PrismaLeadUnitOfWork } from './infrastructure/transactions/prismaLeadUnitOfWork.js';
import { LeadsController } from './presentation/http/controllers/leads.controller.js';
import { PublicLeadsController } from './presentation/http/controllers/publicLeads.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [LeadsController, PublicLeadsController],
  providers: [
    {
      provide: LeadUnitOfWork,
      useClass: PrismaLeadUnitOfWork,
    },
    {
      provide: LeadApplicationService,
      useFactory: (unitOfWork: LeadUnitOfWork) => new LeadApplicationService(unitOfWork),
      inject: [LeadUnitOfWork],
    },
    {
      provide: CreatePublicLeadUseCase,
      useFactory: (unitOfWork: LeadUnitOfWork) => new CreatePublicLeadUseCase(unitOfWork),
      inject: [LeadUnitOfWork],
    },
    {
      provide: ListLeadsUseCase,
      useFactory: (processor: LeadApplicationService) => new ListLeadsUseCase(processor),
      inject: [LeadApplicationService],
    },
    {
      provide: GetLeadUseCase,
      useFactory: (processor: LeadApplicationService) => new GetLeadUseCase(processor),
      inject: [LeadApplicationService],
    },
    {
      provide: MarkLeadContactedUseCase,
      useFactory: (processor: LeadApplicationService) => new MarkLeadContactedUseCase(processor),
      inject: [LeadApplicationService],
    },
    {
      provide: ConvertLeadUseCase,
      useFactory: (processor: LeadApplicationService) => new ConvertLeadUseCase(processor),
      inject: [LeadApplicationService],
    },
    {
      provide: ArchiveLeadUseCase,
      useFactory: (processor: LeadApplicationService) => new ArchiveLeadUseCase(processor),
      inject: [LeadApplicationService],
    },
  ],
})
export class LeadsModule {}
