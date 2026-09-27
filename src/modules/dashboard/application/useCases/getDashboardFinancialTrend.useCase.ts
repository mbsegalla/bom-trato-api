import type { DashboardApplicationService } from '../services/dashboardApplicationService.service.js';
import type {
  DashboardActorParams,
  DashboardFinancialTrendView,
  DashboardPeriodInput,
} from '../types/dashboard.types.js';

export class GetDashboardFinancialTrendUseCase {
  constructor(private readonly processor: DashboardApplicationService) {}

  execute(params: DashboardActorParams, input: DashboardPeriodInput): Promise<DashboardFinancialTrendView> {
    return this.processor.readPeriod(params, input, async ({ dashboard, now }, period) => ({
      generatedAt: now,
      currency: 'brl',
      period,
      ...(await dashboard.financialTrend(period)),
    }));
  }
}
