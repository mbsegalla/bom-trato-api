import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { ReceivableUnitOfWork } from './application/ports/receivableUnitOfWork.port.js';
import { ReceivableApplicationService } from './application/services/receivableApplicationService.service.js';
import { CancelReceivableUseCase } from './application/useCases/cancelReceivable.useCase.js';
import { CreateReceivableUseCase } from './application/useCases/createReceivable.useCase.js';
import { GetReceivableUseCase } from './application/useCases/getReceivable.useCase.js';
import { ListReceivablePaymentsUseCase } from './application/useCases/listReceivablePayments.useCase.js';
import { ListReceivablesUseCase } from './application/useCases/listReceivables.useCase.js';
import { RecordReceivablePaymentUseCase } from './application/useCases/recordReceivablePayment.useCase.js';
import { ReverseReceivablePaymentUseCase } from './application/useCases/reverseReceivablePayment.useCase.js';
import { UpdateReceivableUseCase } from './application/useCases/updateReceivable.useCase.js';
import { PrismaReceivableUnitOfWork } from './infrastructure/transactions/prismaReceivableUnitOfWork.js';
import { ReceivablesController } from './presentation/http/controllers/receivables.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [ReceivablesController],
  providers: [
    {
      provide: ReceivableUnitOfWork,
      useClass: PrismaReceivableUnitOfWork,
    },
    {
      provide: ReceivableApplicationService,
      useFactory: (unitOfWork: ReceivableUnitOfWork) => new ReceivableApplicationService(unitOfWork),
      inject: [ReceivableUnitOfWork],
    },
    {
      provide: CreateReceivableUseCase,
      useFactory: (processor: ReceivableApplicationService) => new CreateReceivableUseCase(processor),
      inject: [ReceivableApplicationService],
    },
    {
      provide: GetReceivableUseCase,
      useFactory: (processor: ReceivableApplicationService) => new GetReceivableUseCase(processor),
      inject: [ReceivableApplicationService],
    },
    {
      provide: ListReceivablesUseCase,
      useFactory: (processor: ReceivableApplicationService) => new ListReceivablesUseCase(processor),
      inject: [ReceivableApplicationService],
    },
    {
      provide: UpdateReceivableUseCase,
      useFactory: (processor: ReceivableApplicationService) => new UpdateReceivableUseCase(processor),
      inject: [ReceivableApplicationService],
    },
    {
      provide: CancelReceivableUseCase,
      useFactory: (processor: ReceivableApplicationService) => new CancelReceivableUseCase(processor),
      inject: [ReceivableApplicationService],
    },
    {
      provide: RecordReceivablePaymentUseCase,
      useFactory: (processor: ReceivableApplicationService) => new RecordReceivablePaymentUseCase(processor),
      inject: [ReceivableApplicationService],
    },
    {
      provide: ReverseReceivablePaymentUseCase,
      useFactory: (processor: ReceivableApplicationService) => new ReverseReceivablePaymentUseCase(processor),
      inject: [ReceivableApplicationService],
    },
    {
      provide: ListReceivablePaymentsUseCase,
      useFactory: (processor: ReceivableApplicationService) => new ListReceivablePaymentsUseCase(processor),
      inject: [ReceivableApplicationService],
    },
  ],
})
export class ReceivablesModule {}
