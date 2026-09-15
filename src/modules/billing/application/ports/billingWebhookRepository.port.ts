import type { ClaimedWebhookJob, WebhookNotice, WebhookOutcome } from '../../domain/types/billingWebhook.types.js';

export abstract class BillingWebhookRepository {
  abstract enqueue(notice: WebhookNotice): Promise<void>;
  abstract claimEvent(leaseToken: string): Promise<ClaimedWebhookJob | null>;
  abstract renewEventLease(event: ClaimedWebhookJob): Promise<boolean>;
  abstract settleEvent(event: ClaimedWebhookJob, outcome: WebhookOutcome, code?: string): Promise<boolean>;
}
