export interface WebhookNotice {
  id: string;
  type: string;
  stripeCustomerId: string;
  stripeObjectId: string;
}

export interface WebhookJob extends WebhookNotice {
  attempts: number;
}

export interface ClaimedWebhookJob extends WebhookJob {
  leaseToken: string;
}

export type WebhookOutcome = 'COMPLETE' | 'DEFER' | 'RETRY';
