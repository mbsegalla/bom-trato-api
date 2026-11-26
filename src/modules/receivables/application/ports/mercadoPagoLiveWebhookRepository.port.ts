import type { LiveWebhookOutcome, LiveWebhookPreparation } from '../../domain/types/mercadoPagoLiveWebhook.types.js';
import type {
  ClaimedMercadoPagoWebhook,
  MercadoPagoWebhookNotice,
} from '../../domain/types/mercadoPagoWebhook.types.js';

export abstract class MercadoPagoLiveWebhookRepository {
  abstract enqueue(notice: MercadoPagoWebhookNotice): Promise<void>;
  abstract claim(clientId: string, leaseToken: string): Promise<ClaimedMercadoPagoWebhook | null>;
  abstract prepare(job: ClaimedMercadoPagoWebhook): Promise<LiveWebhookPreparation>;
  abstract settle(job: ClaimedMercadoPagoWebhook, outcome: LiveWebhookOutcome): Promise<boolean>;
}
