import { WorkOrderError } from '../errors/workOrder.error.js';

export class WorkOrderSchedulePeriod {
  private static readonly maxDuration = 31 * 24 * 60 * 60 * 1000;

  private constructor(
    private readonly start: number,
    private readonly end: number,
  ) {}

  static create(from: Date, to: Date): WorkOrderSchedulePeriod {
    const start = from.getTime();
    const end = to.getTime();

    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > this.maxDuration) {
      throw new WorkOrderError('INVALID_SCHEDULE_PERIOD');
    }

    return new WorkOrderSchedulePeriod(start, end);
  }

  snapshot(): { from: Date; to: Date } {
    return {
      from: new Date(this.start),
      to: new Date(this.end),
    };
  }
}
