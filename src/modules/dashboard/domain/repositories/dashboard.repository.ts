import type {
  DashboardFinancialData,
  DashboardSummaryData,
  DashboardUpcomingData,
} from '../../application/types/dashboard.types.js';
import type { DashboardPeriodProps } from '../../domain/valueObjects/dashboardPeriod.valueObject.js';

export abstract class DashboardRepository {
  abstract summary(period: DashboardPeriodProps, now: Date): Promise<DashboardSummaryData>;
  abstract financial(period: DashboardPeriodProps, now: Date): Promise<DashboardFinancialData>;
  abstract upcomingWorkOrders(now: Date, limit: number): Promise<DashboardUpcomingData>;
}
