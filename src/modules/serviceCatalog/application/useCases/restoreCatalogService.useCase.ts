import type { ServiceCatalogApplicationService } from '../services/serviceCatalogApplicationService.service.js';
import type { CatalogServiceByIdParams } from '../types/catalogService.types.js';

export class RestoreCatalogServiceUseCase {
  constructor(private readonly processor: ServiceCatalogApplicationService) {}

  execute(params: CatalogServiceByIdParams) {
    const { serviceId } = params;

    return this.processor.run(params, async (tx) => {
      const catalogService = await this.processor.load(tx, serviceId);

      catalogService.unarchive(new Date());

      await tx.catalogServices.save(catalogService);

      return catalogService.snapshot();
    });
  }
}
