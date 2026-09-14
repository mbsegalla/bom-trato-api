import { randomUUID } from 'node:crypto';

import type { CatalogServiceDetails } from '../../domain/entities/catalogService.entity.js';
import { CatalogService } from '../../domain/entities/catalogService.entity.js';
import type { CatalogServiceActorParams } from '../ports/catalogServiceUnitOfWork.port.js';
import type { ServiceCatalogApplicationService } from '../services/serviceCatalogApplicationService.service.js';

export class CreateCatalogServiceUseCase {
  constructor(private readonly processor: ServiceCatalogApplicationService) {}

  execute(params: CatalogServiceActorParams, details: CatalogServiceDetails) {
    const { organizationId } = params;

    return this.processor.run(params, async (tx) => {
      const catalogService = CatalogService.create(
        {
          ...details,
          id: randomUUID(),
          organizationId,
        },
        new Date(),
      );

      await tx.catalogServices.create(catalogService);

      return catalogService.snapshot();
    });
  }
}
