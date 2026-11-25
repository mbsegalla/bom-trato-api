import type { TrialMetricsPeriod, TrialMetricsSnapshot } from '../types/trialMetrics.types.js';

export abstract class TrialMetricsReader {
  abstract read(period: TrialMetricsPeriod): Promise<TrialMetricsSnapshot>;
}
