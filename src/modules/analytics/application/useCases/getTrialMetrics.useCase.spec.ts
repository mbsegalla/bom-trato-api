import { describe, expect, it, vi } from 'vitest';

import type { TrialMetricsCounts } from '../types/trialMetrics.types.js';
import { GetTrialMetricsUseCase } from './getTrialMetrics.useCase.js';

const period = {
  from: new Date('2026-01-01T00:00:00Z'),
  toExclusive: new Date('2026-02-01T00:00:00Z'),
  asOf: new Date('2026-02-01T00:00:00Z')
};
const counts: TrialMetricsCounts = {
  started: 3,
  linkedOrganizations: 3,
  openWindow: 0,
  expired: 2,
  revoked: 0,
  detached: 0,
  converted: 1,
  convertedBeforeExpiration: 1,
  convertedAfterExpiration: 0,
  matured: 2,
  maturedConvertedBeforeExpiration: 1,
  customersCreated: 2,
  quotesCreated: 1,
  workOrdersCreated: 0,
  checkoutStarted: 1,
};

describe('GetTrialMetricsUseCase', () => {
  it('calculates correctly rounded rates and distinguishes matured from observed conversion', async () => {
    const read = vi.fn(async () => ({ total: counts, cohorts: [], notifications: [] }));

    const result = await new GetTrialMetricsUseCase({ read }).execute(period);

    expect(result.total.rates).toMatchObject({
      observedConversionRate: 33.33,
      maturedConversionRate: 50,
      customerActivationRate: 66.67,
      workOrderActivationRate: 0
    });
    expect(read).toHaveBeenCalledWith(period);
  });

  it('represents an empty denominator as unknown rather than zero and rejects an invalid period before reading', async () => {
    const read = vi.fn(async () => ({
      total: {
        ...counts,
        started: 0,
        matured: 0,
        linkedOrganizations: 0
      },
      cohorts: [],
      notifications: []
    }));
    const useCase = new GetTrialMetricsUseCase({ read });

    expect((await useCase.execute(period)).total.rates.observedConversionRate).toBeNull();

    read.mockClear();

    await expect(useCase.execute({
      ...period,
      toExclusive: period.from
    })).rejects.toThrow('INVALID_TRIAL_METRICS_PERIOD');
    expect(read).not.toHaveBeenCalled();
  });
});
