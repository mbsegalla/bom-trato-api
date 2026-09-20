export const BILLING_WORK_AVAILABLE_EVENT = 'billing.work.available';

export const BILLING_SCHEDULE_CHANGED_EVENT = 'billing.schedule.changed';

export enum BillingWork {
  WEBHOOKS = 'webhooks',
  PLAN_CHANGES = 'planChanges',
  PAYMENT_METHOD_UPDATES = 'paymentMethodUpdates',
  CONFIRMATIONS = 'confirmations',
  RECONCILIATION = 'reconciliation',
}
