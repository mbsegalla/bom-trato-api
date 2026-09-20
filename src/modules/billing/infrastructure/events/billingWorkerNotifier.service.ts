import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { safeBillingError } from '../logging/safeBillingError.js';

import { BILLING_SCHEDULE_CHANGED_EVENT, BILLING_WORK_AVAILABLE_EVENT, BillingWork } from './billing.events.js';

@Injectable()
export class BillingWorkerNotifier {
  private readonly logger = new Logger(BillingWorkerNotifier.name);

  constructor(private readonly events: EventEmitter2) {}

  notify(work: BillingWork): void {
    this.emit(BILLING_WORK_AVAILABLE_EVENT, work);
  }

  scheduleChanged(work: BillingWork): void {
    this.emit(BILLING_SCHEDULE_CHANGED_EVENT, work);
  }

  private emit(event: string, work: BillingWork): void {
    if (!Object.values(BillingWork).includes(work)) {
      return;
    }

    try {
      this.events.emit(event, work);
    } catch (error: unknown) {
      this.logger.error({
        message: 'Billing worker notification failed; recovery remains available',
        work,
        ...safeBillingError(error),
      });
    }
  }
}
