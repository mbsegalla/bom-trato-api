import { OrganizationAccessPolicy } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import { CatalogService } from '../../domain/entities/catalogService.entity.js';
import { CatalogServiceError } from '../../domain/errors/catalogService.error.js';
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
      OrganizationAccessPolicy.assertCanOperate(context.access, (code) => new CatalogServiceError(code));

      return operation(context);
    });
  }

  run<T>(params: CatalogServiceActorParams, operation: (tx: CatalogServiceTransaction) => Promise<T>): Promise<T> {
    return this.unitOfWork.run(params, (tx) => {
      OrganizationAccessPolicy.assertCanOperate(tx.access, (code) => new CatalogServiceError(code));

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
