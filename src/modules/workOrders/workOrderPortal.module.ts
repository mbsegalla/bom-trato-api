import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ConfigModule } from '@nestjs/config';

import { quoteShareConfig } from '../../config/quoteShare.config.js';
import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { PostgresPublicShareRateLimit } from '../../infrastructure/http/rateLimits/postgresPublicShareRateLimit.js';
import { StorageModule } from '../../infrastructure/storage/storage.module.js';
import { ObjectStorage } from '../../shared/storage/objectStorage.port.js';
import { PrivateObjectStorage } from '../../shared/storage/privateObjectStorage.port.js';

import { PublicWorkOrderUnitOfWork } from './application/ports/publicWorkOrderUnitOfWork.port.js';
import { WorkOrderDocumentPdfGenerator } from './application/ports/workOrderDocumentPdfGenerator.port.js';
import { WorkOrderShareSecurity } from './application/ports/workOrderShareSecurity.port.js';
import { AcceptPublicWorkOrderUseCase } from './application/useCases/acceptPublicWorkOrder.useCase.js';
import { GeneratePublicWorkOrderReportUseCase } from './application/useCases/generatePublicWorkOrderReport.useCase.js';
import { GetPublicWorkOrderUseCase } from './application/useCases/getPublicWorkOrder.useCase.js';
import { GetPublicWorkOrderPhotoContentUseCase } from './application/useCases/getPublicWorkOrderPhotoContent.useCase.js';
import { PublicPortfolioConsentUseCase } from './application/useCases/publicPortfolioConsent.useCase.js';
import { NodeWorkOrderShareSecurity } from './infrastructure/security/nodeWorkOrderShareSecurity.js';
import { PrismaPublicWorkOrderUnitOfWork } from './infrastructure/transactions/prismaPublicWorkOrderUnitOfWork.js';
import { PublicWorkOrdersController } from './presentation/http/controllers/publicWorkOrders.controller.js';
import { WorkOrderShareRateLimitGuard } from './presentation/http/guards/workOrderShareRateLimit.guard.js';
import { WorkOrderDocumentsModule } from './workOrderDocuments.module.js';
import { WorkOrderPortfolioModule } from './workOrderPortfolio.module.js';

@Module({
  imports: [
    DatabaseModule,
    StorageModule,
    WorkOrderDocumentsModule,
    WorkOrderPortfolioModule,
    ConfigModule.forFeature(quoteShareConfig),
  ],
  controllers: [PublicWorkOrdersController],
  providers: [
    WorkOrderShareRateLimitGuard,
    {
      provide: PublicWorkOrderUnitOfWork,
      useClass: PrismaPublicWorkOrderUnitOfWork,
    },
    {
      provide: WorkOrderShareSecurity,
      useClass: NodeWorkOrderShareSecurity,
    },
    {
      provide: PostgresPublicShareRateLimit,
      useFactory: (prisma: PrismaService, config: ConfigType<typeof quoteShareConfig>) =>
        new PostgresPublicShareRateLimit(prisma, config.rateLimitSecret, 'work-order-share'),
      inject: [PrismaService, quoteShareConfig.KEY],
    },
    {
      provide: AcceptPublicWorkOrderUseCase,
      useFactory: (unitOfWork: PublicWorkOrderUnitOfWork, security: WorkOrderShareSecurity) =>
        new AcceptPublicWorkOrderUseCase(unitOfWork, security),
      inject: [PublicWorkOrderUnitOfWork, WorkOrderShareSecurity],
    },
    {
      provide: GetPublicWorkOrderUseCase,
      useFactory: (unitOfWork: PublicWorkOrderUnitOfWork, security: WorkOrderShareSecurity, storage: ObjectStorage) =>
        new GetPublicWorkOrderUseCase(unitOfWork, security, storage),
      inject: [PublicWorkOrderUnitOfWork, WorkOrderShareSecurity, ObjectStorage],
    },
    {
      provide: GeneratePublicWorkOrderReportUseCase,
      useFactory: (getPublicWorkOrder: GetPublicWorkOrderUseCase, generator: WorkOrderDocumentPdfGenerator) =>
        new GeneratePublicWorkOrderReportUseCase(getPublicWorkOrder, generator),
      inject: [GetPublicWorkOrderUseCase, WorkOrderDocumentPdfGenerator],
    },
    {
      provide: GetPublicWorkOrderPhotoContentUseCase,
      useFactory: (
        unitOfWork: PublicWorkOrderUnitOfWork,
        security: WorkOrderShareSecurity,
        storage: PrivateObjectStorage,
      ) => new GetPublicWorkOrderPhotoContentUseCase(unitOfWork, security, storage),
      inject: [PublicWorkOrderUnitOfWork, WorkOrderShareSecurity, PrivateObjectStorage],
    },
  ],
})
export class WorkOrderPortalModule {}
