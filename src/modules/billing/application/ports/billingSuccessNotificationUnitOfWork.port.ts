import type { BillingSuccessNotificationTransaction } from '../types/billing.types.js';

export abstract class BillingSuccessNotificationUnitOfWork {
  abstract run(operation: (tx: BillingSuccessNotificationTransaction) => Promise<void>): Promise<boolean>;
}
