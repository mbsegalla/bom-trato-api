import type { CatalogServiceDetails } from '../../domain/entities/catalogService.entity.js';
import type { ServiceCatalogApplicationService } from '../services/serviceCatalogApplicationService.service.js';
import type { CatalogServiceByIdParams } from '../types/catalogService.types.js';

export class UpdateCatalogServiceUseCase {
  constructor(private readonly processor: ServiceCatalogApplicationService) {}

  execute(params: CatalogServiceByIdParams, details: Partial<CatalogServiceDetails>) {
    return this.processor.run(params, async (tx) => {
      const catalogService = await this.processor.load(tx, params.serviceId);

      catalogService.update(details, new Date());

      await tx.catalogServices.save(catalogService);

      return catalogService.snapshot();
    });
  }
}
