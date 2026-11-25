import 'reflect-metadata';

import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { safeError } from '../../infrastructure/logging/safeError.js';
import { StartupLogger } from '../../infrastructure/logging/startupLogger.js';
import { AnalyticsCommandModule } from '../../modules/analytics/analyticsCommand.module.js';
import type { TrialMetricsPeriod } from '../../modules/analytics/application/types/trialMetrics.types.js';
import { GetTrialMetricsUseCase } from '../../modules/analytics/application/useCases/getTrialMetrics.useCase.js';

const logger = new ConsoleLogger('TrialMetrics');

const DEFAULT_PERIOD_DAYS = 90;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('INVALID_TRIAL_METRICS_DATE');
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('INVALID_TRIAL_METRICS_DATE');
  }

  return date;
}

function defaultPeriod(now: Date): TrialMetricsPeriod {
  const toExclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

  return {
    from: new Date(toExclusive.getTime() - DEFAULT_PERIOD_DAYS * MILLISECONDS_PER_DAY),
    toExclusive,
    asOf: now,
  };
}

function resolvePeriod(args: string[], now: Date): TrialMetricsPeriod {
  if (args.length === 0) {
    return defaultPeriod(now);
  }

  if (args.length !== 2) {
    throw new Error('Usage: trialMetrics [YYYY-MM-DD YYYY-MM-DD]');
  }

  const [from, toExclusive] = args;

  return {
    from: parseDate(from),
    toExclusive: parseDate(toExclusive),
    asOf: now,
  };
}

async function main(): Promise<void> {
  const period = resolvePeriod(process.argv.slice(2), new Date());

  const app = await NestFactory.createApplicationContext(AnalyticsCommandModule, {
    logger: new StartupLogger('TrialMetrics'),
    abortOnError: false,
  });

  app.useLogger(new ConsoleLogger());

  try {
    const getTrialMetrics = app.get(GetTrialMetricsUseCase);

    const report = await getTrialMetrics.execute(period);

    logger.log('Trial metrics report generated successfully.');

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  logger.error({
    message: 'Trial metrics report could not be generated',
    ...safeError(error),
  });

  process.exitCode = 1;
});
