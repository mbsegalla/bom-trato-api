import { DashboardError } from '../../domain/errors/dashboard.error.js';
import type { DashboardApplicationService } from '../services/dashboardApplicationService.service.js';
import type { DashboardActorParams, DashboardUpcomingView } from '../types/dashboard.types.js';

export class ListDashboardUpcomingWorkOrdersUseCase {
  constructor(private readonly processor: DashboardApplicationService) {}

  execute(params: DashboardActorParams, limit: number): Promise<DashboardUpcomingView> {
    return this.processor.read(params, async ({ dashboard, now }) => {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
        throw new DashboardError('INVALID_DASHBOARD_LIMIT');
      }

      return {
        generatedAt: now,
        ...(await dashboard.upcomingWorkOrders(now, limit)),
      };
    });
  }
}
