export interface TrialMetricsPeriod {
  from: Date;
  toExclusive: Date;
  asOf: Date;
}

export interface TrialMetricsCounts {
  started: number;
  linkedOrganizations: number;
  openWindow: number;
  expired: number;
  revoked: number;
  detached: number;
  converted: number;
  convertedBeforeExpiration: number;
  convertedAfterExpiration: number;
  matured: number;
  maturedConvertedBeforeExpiration: number;
  customersCreated: number;
  quotesCreated: number;
  workOrdersCreated: number;
  checkoutStarted: number;
}

export interface TrialMetricsRates {
  observedConversionRate: number | null;
  maturedConversionRate: number | null;
  customerActivationRate: number | null;
  quoteActivationRate: number | null;
  workOrderActivationRate: number | null;
  checkoutStartRate: number | null;
}

export interface TrialMetricsSummary {
  counts: TrialMetricsCounts;
  rates: TrialMetricsRates;
}

export interface TrialMetricsCohortCounts {
  weekStart: string;
  counts: TrialMetricsCounts;
}

export interface TrialMetricsCohort extends TrialMetricsSummary {
  weekStart: string;
}

export interface TrialNotificationMetrics {
  stage: string;
  total: number;
  pending: number;
  processing: number;
  accepted: number;
  failed: number;
  skipped: number;
}

export interface TrialMetricsSnapshot {
  total: TrialMetricsCounts;
  cohorts: TrialMetricsCohortCounts[];
  notifications: TrialNotificationMetrics[];
}

export interface TrialMetricsReport {
  period: TrialMetricsPeriod;
  total: TrialMetricsSummary;
  cohorts: TrialMetricsCohort[];
  notifications: TrialNotificationMetrics[];
}
