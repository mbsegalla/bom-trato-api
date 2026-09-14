import type { CatalogServiceAccessContext } from '../../domain/policies/catalogServiceAccess.policy.js';
import type { CatalogServiceRepository } from '../../domain/repositories/catalogService.repository.js';

export interface CatalogServiceActorParams {
  organizationId: string;
  userId: string;
}

export interface CatalogServiceReadContext {
  readonly catalogServices: Pick<CatalogServiceRepository, 'findById' | 'list'>;
  readonly access: CatalogServiceAccessContext;
}

export interface CatalogServiceTransaction {
  readonly catalogServices: CatalogServiceRepository;
  readonly access: CatalogServiceAccessContext;
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
