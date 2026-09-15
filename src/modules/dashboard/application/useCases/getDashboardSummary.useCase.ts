import type { DashboardApplicationService } from '../services/dashboardApplicationService.service.js';
import type { DashboardActorParams, DashboardPeriodInput, DashboardSummaryView } from '../types/dashboard.types.js';

export class GetDashboardSummaryUseCase {
  constructor(private readonly processor: DashboardApplicationService) {}

  execute(params: DashboardActorParams, input: DashboardPeriodInput): Promise<DashboardSummaryView> {
    return this.processor.readPeriod(params, input, async ({ dashboard, now }, period) => ({
      generatedAt: now,
      period,
      ...(await dashboard.summary(period, now)),
    }));
  }
}
