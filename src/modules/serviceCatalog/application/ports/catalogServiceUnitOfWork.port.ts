import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type { CatalogServiceRepository } from '../../domain/repositories/catalogService.repository.js';

export interface CatalogServiceActorParams {
  organizationId: string;
  userId: string;
}

export interface CatalogServiceReadContext {
  readonly catalogServices: Pick<CatalogServiceRepository, 'findById' | 'list'>;
  readonly access: OrganizationAccessContext;
}

export interface CatalogServiceTransaction {
  readonly catalogServices: CatalogServiceRepository;
  readonly access: OrganizationAccessContext;
}

export abstract class CatalogServiceUnitOfWork {
  abstract read<T>(
    params: CatalogServiceActorParams,
    operation: (context: CatalogServiceReadContext) => Promise<T>,
  ): Promise<T>;
  abstract run<T>(
    params: CatalogServiceActorParams,
    operation: (tx: CatalogServiceTransaction) => Promise<T>,
  ): Promise<T>;
}
