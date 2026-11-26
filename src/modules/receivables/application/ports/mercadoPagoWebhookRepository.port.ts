import type { MercadoPagoWebhookNotice } from '../../domain/types/mercadoPagoWebhook.types.js';

export abstract class MercadoPagoWebhookRepository {
  abstract enqueue(notice: MercadoPagoWebhookNotice): Promise<void>;
}
