import { CatalogService } from '../../domain/entities/catalogService.entity.js';
import { CatalogServiceError } from '../../domain/errors/catalogService.error.js';
import { CatalogServiceAccessPolicy } from '../../domain/policies/catalogServiceAccess.policy.js';
import type {
  CatalogServiceActorParams,
  CatalogServiceReadContext,
  CatalogServiceTransaction,
  CatalogServiceUnitOfWork,
} from '../ports/catalogServiceUnitOfWork.port.js';

export class ServiceCatalogApplicationService {
  constructor(private readonly unitOfWork: CatalogServiceUnitOfWork) {}

  read<T>(
    params: CatalogServiceActorParams,
    operation: (context: CatalogServiceReadContext) => Promise<T>,
  ): Promise<T> {
    return this.unitOfWork.read(params, (context) => {
      new CatalogServiceAccessPolicy(context.access).assertCanManage();

      return operation(context);
    });
  }

  run<T>(params: CatalogServiceActorParams, operation: (tx: CatalogServiceTransaction) => Promise<T>): Promise<T> {
    return this.unitOfWork.run(params, (tx) => {
      new CatalogServiceAccessPolicy(tx.access).assertCanManage();

      return operation(tx);
    });
  }

  async load(context: CatalogServiceReadContext, id: string): Promise<CatalogService> {
    const state = await context.catalogServices.findById(id);

    if (state === null) {
      throw new CatalogServiceError('CATALOG_SERVICE_NOT_FOUND');
    }

    return CatalogService.restore(state);
  }
}
