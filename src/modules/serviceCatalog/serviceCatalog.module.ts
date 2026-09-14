import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module.js';

import { CatalogServiceUnitOfWork } from './application/ports/catalogServiceUnitOfWork.port.js';
import { ServiceCatalogApplicationService } from './application/services/serviceCatalogApplicationService.service.js';
import { ArchiveCatalogServiceUseCase } from './application/useCases/archiveCatalogService.useCase.js';
import { CreateCatalogServiceUseCase } from './application/useCases/createCatalogService.useCase.js';
import { GetCatalogServiceUseCase } from './application/useCases/getCatalogService.useCase.js';
import { ListCatalogServicesUseCase } from './application/useCases/listCatalogServices.useCase.js';
import { RestoreCatalogServiceUseCase } from './application/useCases/restoreCatalogService.useCase.js';
import { UpdateCatalogServiceUseCase } from './application/useCases/updateCatalogService.useCase.js';
import { PrismaCatalogServiceUnitOfWork } from './infrastructure/transactions/prismaCatalogServiceUnitOfWork.js';
import { CatalogServicesController } from './presentation/http/controllers/catalogServices.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [CatalogServicesController],
  providers: [
    {
      provide: CatalogServiceUnitOfWork,
      useClass: PrismaCatalogServiceUnitOfWork,
    },
    {
      provide: ServiceCatalogApplicationService,
      useFactory: (unitOfWork: CatalogServiceUnitOfWork) => new ServiceCatalogApplicationService(unitOfWork),
      inject: [CatalogServiceUnitOfWork],
    },
    {
      provide: CreateCatalogServiceUseCase,
      useFactory: (processor: ServiceCatalogApplicationService) => new CreateCatalogServiceUseCase(processor),
      inject: [ServiceCatalogApplicationService],
    },
    {
      provide: ListCatalogServicesUseCase,
      useFactory: (processor: ServiceCatalogApplicationService) => new ListCatalogServicesUseCase(processor),
      inject: [ServiceCatalogApplicationService],
    },
    {
      provide: GetCatalogServiceUseCase,
      useFactory: (processor: ServiceCatalogApplicationService) => new GetCatalogServiceUseCase(processor),
      inject: [ServiceCatalogApplicationService],
    },
    {
      provide: UpdateCatalogServiceUseCase,
      useFactory: (processor: ServiceCatalogApplicationService) => new UpdateCatalogServiceUseCase(processor),
      inject: [ServiceCatalogApplicationService],
    },
    {
      provide: ArchiveCatalogServiceUseCase,
      useFactory: (processor: ServiceCatalogApplicationService) => new ArchiveCatalogServiceUseCase(processor),
      inject: [ServiceCatalogApplicationService],
    },
    {
      provide: RestoreCatalogServiceUseCase,
      useFactory: (processor: ServiceCatalogApplicationService) => new RestoreCatalogServiceUseCase(processor),
      inject: [ServiceCatalogApplicationService],
    },
  ],
})
export class ServiceCatalogModule {}
