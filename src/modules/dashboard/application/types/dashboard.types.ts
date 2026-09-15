import type { DashboardPeriodProps } from '../../domain/valueObjects/dashboardPeriod.valueObject.js';

export interface DashboardActorParams {
  organizationId: string;
  userId: string;
}

export interface DashboardPeriodInput {
  from: string;
  to: string;
}

export interface DashboardQuoteCounters {
  draft: number;
  awaitingApproval: number;
  expiredSent: number;
}

export interface DashboardWorkOrderCounters {
  open: number;
  scheduled: number;
  inProgress: number;
  completedInPeriod: number;
}

export interface DashboardSummaryData {
  quotes: DashboardQuoteCounters;
  workOrders: DashboardWorkOrderCounters;
}

export interface DashboardCurrentReceivables {
  pendingCount: number;
  pendingAmountInCents: number;
  overdueCount: number;
  overdueAmountInCents: number;
}

export interface DashboardPeriodReceipts {
  count: number;
  amountInCents: number;
}

export interface DashboardFinancialData {
  currentReceivables: DashboardCurrentReceivables;
  periodReceipts: DashboardPeriodReceipts;
}

export interface DashboardAssignedUser {
  id: string;
  name: string;
}

export interface DashboardUpcomingWorkOrder {
  id: string;
  customerId: string;
  customerName: string;
  title: string;
  serviceAddress: string | null;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  assignedTo: DashboardAssignedUser | null;
}

export interface DashboardUpcomingData {
  items: DashboardUpcomingWorkOrder[];
  hasMore: boolean;
}

export interface DashboardSummaryView extends DashboardSummaryData {
  generatedAt: Date;
  period: DashboardPeriodProps;
}

export interface DashboardFinancialView extends DashboardFinancialData {
  generatedAt: Date;
  currency: 'brl';
  period: DashboardPeriodProps;
}

export interface DashboardUpcomingView extends DashboardUpcomingData {
  generatedAt: Date;
}
