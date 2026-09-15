import type { DashboardAccessContext } from '../../domain/policies/dashboardAccess.policy.js';
import type { DashboardActorParams } from '../types/dashboard.types.js';

import type { DashboardRepository } from './dashboardRepository.port.js';

export interface DashboardReadContext {
  dashboard: DashboardRepository;
  access: DashboardAccessContext;
  now: Date;
}

export abstract class DashboardUnitOfWork {
  abstract read<T>(params: DashboardActorParams, operation: (context: DashboardReadContext) => Promise<T>): Promise<T>;
}
