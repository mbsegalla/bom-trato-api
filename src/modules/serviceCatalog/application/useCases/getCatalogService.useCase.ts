import type { ServiceCatalogApplicationService } from '../services/serviceCatalogApplicationService.service.js';
import type { CatalogServiceByIdParams } from '../types/catalogService.types.js';

export class GetCatalogServiceUseCase {
  constructor(private readonly processor: ServiceCatalogApplicationService) {}

  execute(params: CatalogServiceByIdParams) {
    const { serviceId } = params;

    return this.processor.read(params, async (context) => {
      const service = await this.processor.load(context, serviceId);

      return service.snapshot();
    });
  }
}
