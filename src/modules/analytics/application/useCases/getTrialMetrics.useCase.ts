import type { TrialMetricsReader } from '../ports/trialMetricsReader.port.js';
import type {
  TrialMetricsCounts,
  TrialMetricsPeriod,
  TrialMetricsRates,
  TrialMetricsReport,
  TrialMetricsSummary,
} from '../types/trialMetrics.types.js';

export class GetTrialMetricsUseCase {
  constructor(private readonly reader: TrialMetricsReader) {}

  async execute(period: TrialMetricsPeriod): Promise<TrialMetricsReport> {
    this.assertValidPeriod(period);

    const snapshot = await this.reader.read(period);

    return {
      period,
      total: this.summarize(snapshot.total),
      cohorts: snapshot.cohorts.map(({ weekStart, counts }) => ({
        weekStart,
        ...this.summarize(counts),
      })),
      notifications: snapshot.notifications,
    };
  }

  private assertValidPeriod(period: TrialMetricsPeriod): void {
    const { from, toExclusive, asOf } = period;

    const validDates = [from, toExclusive, asOf].every((date) => Number.isFinite(date.getTime()));

    if (!validDates || from >= toExclusive || from > asOf) {
      throw new Error('INVALID_TRIAL_METRICS_PERIOD');
    }
  }

  private summarize(counts: TrialMetricsCounts): TrialMetricsSummary {
    return {
      counts,
      rates: this.calculateRates(counts),
    };
  }

  private calculateRates(counts: TrialMetricsCounts): TrialMetricsRates {
    return {
      observedConversionRate: this.percentage(counts.converted, counts.started),
      maturedConversionRate: this.percentage(counts.maturedConvertedBeforeExpiration, counts.matured),
      customerActivationRate: this.percentage(counts.customersCreated, counts.linkedOrganizations),
      quoteActivationRate: this.percentage(counts.quotesCreated, counts.linkedOrganizations),
      workOrderActivationRate: this.percentage(counts.workOrdersCreated, counts.linkedOrganizations),
      checkoutStartRate: this.percentage(counts.checkoutStarted, counts.linkedOrganizations),
    };
  }

  private percentage(numerator: number, denominator: number): number | null {
    if (denominator === 0) {
      return null;
    }

    return Math.round((numerator / denominator) * 10_000) / 100;
  }
}
