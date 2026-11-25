import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';
import { StorageModule } from '../../infrastructure/storage/storage.module.js';
import { PrivateObjectStorage } from '../../shared/storage/privateObjectStorage.port.js';

import { WorkOrderPortfolioRepository } from './application/ports/workOrderPortfolio.repository.js';
import { WorkOrderShareSecurity } from './application/ports/workOrderShareSecurity.port.js';
import {
  GetPublicPortfolioPhotoContentUseCase,
} from './application/useCases/getPublicPortfolioPhotoContent.useCase.js';
import { ManageWorkOrderPortfolioUseCase } from './application/useCases/manageWorkOrderPortfolio.useCase.js';
import { PublicPortfolioConsentUseCase } from './application/useCases/publicPortfolioConsent.useCase.js';
import {
  PrismaWorkOrderPortfolioRepository,
} from './infrastructure/repositories/prismaWorkOrderPortfolio.repository.js';
import { NodeWorkOrderShareSecurity } from './infrastructure/security/nodeWorkOrderShareSecurity.js';
import { PublicPortfolioImagesController } from './presentation/http/controllers/publicPortfolioImages.controller.js';
import { WorkOrderPortfolioController } from './presentation/http/controllers/workOrderPortfolio.controller.js';

@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [WorkOrderPortfolioController, PublicPortfolioImagesController],
  providers: [
    { provide: WorkOrderPortfolioRepository, useClass: PrismaWorkOrderPortfolioRepository },
    { provide: WorkOrderShareSecurity, useClass: NodeWorkOrderShareSecurity },
    {
      provide: PublicPortfolioConsentUseCase,
      useFactory: (repository: WorkOrderPortfolioRepository, security: WorkOrderShareSecurity) =>
        new PublicPortfolioConsentUseCase(repository, security),
      inject: [WorkOrderPortfolioRepository, WorkOrderShareSecurity],
    },
    {
      provide: ManageWorkOrderPortfolioUseCase,
      useFactory: (repository: WorkOrderPortfolioRepository) => new ManageWorkOrderPortfolioUseCase(repository),
      inject: [WorkOrderPortfolioRepository],
    },
    {
      provide: GetPublicPortfolioPhotoContentUseCase,
      useFactory: (repository: WorkOrderPortfolioRepository, storage: PrivateObjectStorage) =>
        new GetPublicPortfolioPhotoContentUseCase(repository, storage),
      inject: [WorkOrderPortfolioRepository, PrivateObjectStorage],
    },
  ],
  exports: [WorkOrderPortfolioRepository, PublicPortfolioConsentUseCase],
})
export class WorkOrderPortfolioModule {}
