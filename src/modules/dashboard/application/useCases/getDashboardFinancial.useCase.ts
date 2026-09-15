import type { DashboardApplicationService } from '../services/dashboardApplicationService.service.js';
import type { DashboardActorParams, DashboardFinancialView, DashboardPeriodInput } from '../types/dashboard.types.js';

export class GetDashboardFinancialUseCase {
  constructor(private readonly processor: DashboardApplicationService) {}

  execute(params: DashboardActorParams, input: DashboardPeriodInput): Promise<DashboardFinancialView> {
    return this.processor.readPeriod(params, input, async ({ dashboard, now }, period) => ({
      generatedAt: now,
      currency: 'brl',
      period,
      ...(await dashboard.financial(period, now)),
    }));
  }
}
