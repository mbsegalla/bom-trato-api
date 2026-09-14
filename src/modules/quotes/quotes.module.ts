import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { QuoteUnitOfWork } from './application/ports/quoteUnitOfWork.port.js';
import { QuoteApplicationService } from './application/services/quoteApplicationService.service.js';
import { AddQuoteItemUseCase } from './application/useCases/addQuoteItem.useCase.js';
import { ApproveQuoteUseCase } from './application/useCases/approveQuote.useCase.js';
import { CancelQuoteUseCase } from './application/useCases/cancelQuote.useCase.js';
import { CreateQuoteUseCase } from './application/useCases/createQuote.useCase.js';
import { DeclineQuoteUseCase } from './application/useCases/declineQuote.useCase.js';
import { GetQuoteUseCase } from './application/useCases/getQuote.useCase.js';
import { ListQuotesUseCase } from './application/useCases/listQuotes.useCase.js';
import { RemoveQuoteItemUseCase } from './application/useCases/removeQuoteItem.useCase.js';
import { ReplaceQuoteItemUseCase } from './application/useCases/replaceQuoteItem.useCase.js';
import { SendQuoteUseCase } from './application/useCases/sendQuote.useCase.js';
import { UpdateQuoteUseCase } from './application/useCases/updateQuote.useCase.js';
import { PrismaQuoteUnitOfWork } from './infrastructure/transactions/prismaQuoteUnitOfWork.js';
import { QuotesController } from './presentation/http/controllers/quotes.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [QuotesController],
  providers: [
    {
      provide: QuoteUnitOfWork,
      useClass: PrismaQuoteUnitOfWork,
    },
    {
      provide: QuoteApplicationService,
      useFactory: (unitOfWork: QuoteUnitOfWork) => new QuoteApplicationService(unitOfWork),
      inject: [QuoteUnitOfWork],
    },
    {
      provide: CreateQuoteUseCase,
      useFactory: (processor: QuoteApplicationService) => new CreateQuoteUseCase(processor),
      inject: [QuoteApplicationService],
    },
    {
      provide: ListQuotesUseCase,
      useFactory: (processor: QuoteApplicationService) => new ListQuotesUseCase(processor),
      inject: [QuoteApplicationService],
    },
    {
      provide: GetQuoteUseCase,
      useFactory: (processor: QuoteApplicationService) => new GetQuoteUseCase(processor),
      inject: [QuoteApplicationService],
    },
    {
      provide: UpdateQuoteUseCase,
      useFactory: (processor: QuoteApplicationService) => new UpdateQuoteUseCase(processor),
      inject: [QuoteApplicationService],
    },
    {
      provide: AddQuoteItemUseCase,
      useFactory: (processor: QuoteApplicationService) => new AddQuoteItemUseCase(processor),
      inject: [QuoteApplicationService],
    },
    {
      provide: ReplaceQuoteItemUseCase,
      useFactory: (processor: QuoteApplicationService) => new ReplaceQuoteItemUseCase(processor),
      inject: [QuoteApplicationService],
    },
    {
      provide: RemoveQuoteItemUseCase,
      useFactory: (processor: QuoteApplicationService) => new RemoveQuoteItemUseCase(processor),
      inject: [QuoteApplicationService],
    },
    {
      provide: SendQuoteUseCase,
      useFactory: (processor: QuoteApplicationService) => new SendQuoteUseCase(processor),
      inject: [QuoteApplicationService],
    },
    {
      provide: ApproveQuoteUseCase,
      useFactory: (processor: QuoteApplicationService) => new ApproveQuoteUseCase(processor),
      inject: [QuoteApplicationService],
    },
    {
      provide: DeclineQuoteUseCase,
      useFactory: (processor: QuoteApplicationService) => new DeclineQuoteUseCase(processor),
      inject: [QuoteApplicationService],
    },
    {
      provide: CancelQuoteUseCase,
      useFactory: (processor: QuoteApplicationService) => new CancelQuoteUseCase(processor),
      inject: [QuoteApplicationService],
    },
  ],
})
export class QuotesModule {}
