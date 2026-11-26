import type { MercadoPagoWebhookOutcome } from '../types/mercadoPagoWebhook.types.js';

export const MERCADO_PAGO_WEBHOOK_MAX_ATTEMPTS = 25;

// Unmatched notifications can arrive before the original create request has
// finished. Keep them retryable across the initial race and provider outages.
export function mercadoPagoWebhookRetryDelaySeconds(attempts: number): number {
  return Math.min(3600, 30 * 2 ** Math.min(attempts, 7));
}

export function mercadoPagoWebhookDisposition(outcome: MercadoPagoWebhookOutcome, attempts: number) {
  if (outcome.kind === 'CHECKED') {
    return {
      complete: outcome.status !== 'REVIEW_REQUIRED' && outcome.status !== 'REFUNDED',
      review: outcome.status === 'REVIEW_REQUIRED' || outcome.status === 'REFUNDED',
      code: 'VERIFIED_' + outcome.status,
      matchedIssuanceId: outcome.binding.issuanceId,
    };
  }

  return {
    complete: false,
    review: outcome.kind === 'REVIEW' || attempts + 1 >= MERCADO_PAGO_WEBHOOK_MAX_ATTEMPTS,
    code: outcome.code,
    matchedIssuanceId: null,
  };
}
