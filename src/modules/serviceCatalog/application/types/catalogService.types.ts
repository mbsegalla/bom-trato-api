import type { CatalogServiceActorParams } from '../ports/catalogServiceUnitOfWork.port.js';

export interface CatalogServiceByIdParams extends CatalogServiceActorParams {
  serviceId: string;
}
