import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { BILLING_WORK_AVAILABLE_EVENT, BillingWork } from './billing.events.js';

@Injectable()
export class BillingWorkerNotifier {
  private readonly logger = new Logger(BillingWorkerNotifier.name);

  constructor(private readonly events: EventEmitter2) {}

  notify(work: BillingWork): void {
    try {
      this.events.emit(BILLING_WORK_AVAILABLE_EVENT, work);
    } catch {
      this.logger.error({
        message: 'Billing worker notification failed; recovery remains available',
        work,
      });
    }
  }
}
