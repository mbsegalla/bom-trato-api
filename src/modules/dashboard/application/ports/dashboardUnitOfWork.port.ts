import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type { DashboardRepository } from '../../domain/repositories/dashboard.repository.js';
import type { DashboardActorParams } from '../types/dashboard.types.js';

export interface DashboardReadContext {
  dashboard: DashboardRepository;
  access: OrganizationAccessContext;
  now: Date;
}

export abstract class DashboardUnitOfWork {
  abstract read<T>(params: DashboardActorParams, operation: (context: DashboardReadContext) => Promise<T>): Promise<T>;
}
