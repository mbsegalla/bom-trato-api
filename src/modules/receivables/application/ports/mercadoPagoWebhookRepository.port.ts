import type {
  ClaimedMercadoPagoWebhook,
  MercadoPagoWebhookNotice,
  MercadoPagoWebhookOutcome,
  SandboxPixWebhookPreparation,
} from '../../domain/types/mercadoPagoWebhook.types.js';

export abstract class MercadoPagoWebhookRepository {
  abstract enqueue(notice: MercadoPagoWebhookNotice): Promise<void>;
  abstract claim(clientId: string, leaseToken: string): Promise<ClaimedMercadoPagoWebhook | null>;
  abstract prepare(job: ClaimedMercadoPagoWebhook): Promise<SandboxPixWebhookPreparation>;
  abstract settle(job: ClaimedMercadoPagoWebhook, outcome: MercadoPagoWebhookOutcome): Promise<boolean>;
}
