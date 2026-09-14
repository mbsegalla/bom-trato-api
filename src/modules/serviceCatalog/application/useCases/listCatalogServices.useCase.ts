import type { CatalogServicePageParams } from '../../domain/types/catalogServicePage.types.js';
import type { CatalogServiceActorParams } from '../ports/catalogServiceUnitOfWork.port.js';
import type { ServiceCatalogApplicationService } from '../services/serviceCatalogApplicationService.service.js';

export class ListCatalogServicesUseCase {
  constructor(private readonly processor: ServiceCatalogApplicationService) {}

  execute(params: CatalogServiceActorParams, page: CatalogServicePageParams) {
    return this.processor.read(params, (context) => context.catalogServices.list(page));
  }
}
