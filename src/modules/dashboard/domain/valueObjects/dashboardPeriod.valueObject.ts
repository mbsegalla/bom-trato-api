import { DashboardError } from '../errors/dashboard.error.js';

export interface DashboardPeriodProps {
  from: Date;
  to: Date;
}

export class DashboardPeriod {
  private static readonly maxDuration = 366 * 24 * 60 * 60 * 1000;

  private constructor(
    private readonly fromTimestamp: number,
    private readonly toTimestamp: number,
  ) {}

  static create(from: Date, to: Date): DashboardPeriod {
    if (!(from instanceof Date) || !(to instanceof Date)) {
      throw new DashboardError('INVALID_DASHBOARD_PERIOD');
    }

    const start = from.getTime();
    const end = to.getTime();

    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > DashboardPeriod.maxDuration) {
      throw new DashboardError('INVALID_DASHBOARD_PERIOD');
    }

    return new DashboardPeriod(start, end);
  }

  snapshot(): DashboardPeriodProps {
    return {
      from: new Date(this.fromTimestamp),
      to: new Date(this.toTimestamp),
    };
  }
}
