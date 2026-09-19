import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';

import { appConfig } from '../../config/app.config.js';
import { quoteShareConfig } from '../../config/quoteShare.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

import { PublicQuoteUnitOfWork } from './application/ports/publicQuoteUnitOfWork.port.js';
import { QuotePdfGenerator } from './application/ports/quotePdfGenerator.port.js';
import { QuoteShareSecurity } from './application/ports/quoteShareSecurity.port.js';
import { QuoteUnitOfWork } from './application/ports/quoteUnitOfWork.port.js';
import { PublicQuoteApplicationService } from './application/services/publicQuoteApplicationService.service.js';
import { QuoteApplicationService } from './application/services/quoteApplicationService.service.js';
import { AddQuoteItemUseCase } from './application/useCases/addQuoteItem.useCase.js';
import { ApprovePublicQuoteUseCase } from './application/useCases/approvePublicQuote.useCase.js';
import { ApproveQuoteUseCase } from './application/useCases/approveQuote.useCase.js';
import { CancelQuoteUseCase } from './application/useCases/cancelQuote.useCase.js';
import { CreateQuoteUseCase } from './application/useCases/createQuote.useCase.js';
import { CreateQuoteShareUseCase } from './application/useCases/createQuoteShare.useCase.js';
import { DeclinePublicQuoteUseCase } from './application/useCases/declinePublicQuote.useCase.js';
import { DeclineQuoteUseCase } from './application/useCases/declineQuote.useCase.js';
import { GeneratePublicQuotePdfUseCase } from './application/useCases/generatePublicQuotePdf.useCase.js';
import { GenerateQuotePdfUseCase } from './application/useCases/generateQuotePdf.useCase.js';
import { GetPublicQuoteUseCase } from './application/useCases/getPublicQuote.useCase.js';
import { GetQuoteUseCase } from './application/useCases/getQuote.useCase.js';
import { ListQuotesUseCase } from './application/useCases/listQuotes.useCase.js';
import { ListQuoteStatusHistoryUseCase } from './application/useCases/listQuoteStatusHistory.useCase.js';
import { RemoveQuoteItemUseCase } from './application/useCases/removeQuoteItem.useCase.js';
import { ReplaceQuoteItemUseCase } from './application/useCases/replaceQuoteItem.useCase.js';
import { RevokeQuoteShareUseCase } from './application/useCases/revokeQuoteShare.useCase.js';
import { SendQuoteUseCase } from './application/useCases/sendQuote.useCase.js';
import { UpdateQuoteUseCase } from './application/useCases/updateQuote.useCase.js';
import { PdfKitQuotePdfGenerator } from './infrastructure/pdf/pdfKitQuotePdfGenerator.js';
import { PrismaQuoteShareRateLimit } from './infrastructure/rateLimits/prismaQuoteShareRateLimit.js';
import { NodeQuoteShareSecurity } from './infrastructure/security/nodeQuoteShareSecurity.js';
import { PrismaPublicQuoteUnitOfWork } from './infrastructure/transactions/prismaPublicQuoteUnitOfWork.js';
import { PrismaQuoteUnitOfWork } from './infrastructure/transactions/prismaQuoteUnitOfWork.js';
import { QuoteShareCleanupWorker } from './infrastructure/workers/quoteShareCleanup.worker.js';
import { PublicQuotesController } from './presentation/http/controllers/publicQuotes.controller.js';
import { QuotesController } from './presentation/http/controllers/quotes.controller.js';
import { QuoteSharesController } from './presentation/http/controllers/quoteShares.controller.js';
import { QuoteShareRateLimitGuard } from './presentation/http/guards/quoteShareRateLimit.guard.js';

@Module({
  imports: [DatabaseModule, ConfigModule.forFeature(appConfig), ConfigModule.forFeature(quoteShareConfig)],
  controllers: [QuotesController, QuoteSharesController, PublicQuotesController],
  providers: [
    QuoteShareRateLimitGuard,
    QuoteShareCleanupWorker,
    {
      provide: QuoteUnitOfWork,
      useClass: PrismaQuoteUnitOfWork,
    },
    {
      provide: QuotePdfGenerator,
      useClass: PdfKitQuotePdfGenerator,
    },
    {
      provide: QuoteShareSecurity,
      useClass: NodeQuoteShareSecurity,
    },
    {
      provide: PublicQuoteUnitOfWork,
      useClass: PrismaPublicQuoteUnitOfWork,
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
      provide: GenerateQuotePdfUseCase,
      useFactory: (processor: QuoteApplicationService, generator: QuotePdfGenerator) =>
        new GenerateQuotePdfUseCase(processor, generator),
      inject: [QuoteApplicationService, QuotePdfGenerator],
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
    {
      provide: ListQuoteStatusHistoryUseCase,
      useFactory: (processor: QuoteApplicationService) => new ListQuoteStatusHistoryUseCase(processor),
      inject: [QuoteApplicationService],
    },
    {
      provide: PublicQuoteApplicationService,
      useFactory: (unitOfWork: PublicQuoteUnitOfWork, security: QuoteShareSecurity) =>
        new PublicQuoteApplicationService(unitOfWork, security),
      inject: [PublicQuoteUnitOfWork, QuoteShareSecurity],
    },
    {
      provide: PrismaQuoteShareRateLimit,
      useFactory: (prisma: PrismaService, config: ConfigType<typeof quoteShareConfig>) =>
        new PrismaQuoteShareRateLimit(prisma, config.rateLimitSecret),
      inject: [PrismaService, quoteShareConfig.KEY],
    },
    {
      provide: CreateQuoteShareUseCase,
      useFactory: (processor: QuoteApplicationService, security: QuoteShareSecurity) =>
        new CreateQuoteShareUseCase(processor, security),
      inject: [QuoteApplicationService, QuoteShareSecurity],
    },
    {
      provide: RevokeQuoteShareUseCase,
      useFactory: (processor: QuoteApplicationService) => new RevokeQuoteShareUseCase(processor),
      inject: [QuoteApplicationService],
    },
    {
      provide: GetPublicQuoteUseCase,
      useFactory: (processor: PublicQuoteApplicationService) => new GetPublicQuoteUseCase(processor),
      inject: [PublicQuoteApplicationService],
    },
    {
      provide: GeneratePublicQuotePdfUseCase,
      useFactory: (processor: PublicQuoteApplicationService, generator: QuotePdfGenerator) =>
        new GeneratePublicQuotePdfUseCase(processor, generator),
      inject: [PublicQuoteApplicationService, QuotePdfGenerator],
    },
    {
      provide: ApprovePublicQuoteUseCase,
      useFactory: (processor: PublicQuoteApplicationService) => new ApprovePublicQuoteUseCase(processor),
      inject: [PublicQuoteApplicationService],
    },
    {
      provide: DeclinePublicQuoteUseCase,
      useFactory: (processor: PublicQuoteApplicationService) => new DeclinePublicQuoteUseCase(processor),
      inject: [PublicQuoteApplicationService],
    },
  ],
})
export class QuotesModule {}
