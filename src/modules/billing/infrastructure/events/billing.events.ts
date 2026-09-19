export const BILLING_WORK_AVAILABLE_EVENT = 'billing.work.available';

export enum BillingWork {
  WEBHOOKS = 'webhooks',
  PLAN_CHANGES = 'planChanges',
  PAYMENT_METHOD_UPDATES = 'paymentMethodUpdates',
  CONFIRMATIONS = 'confirmations',
  RECONCILIATION = 'reconciliation',
}
