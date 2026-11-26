import type { MercadoPagoLivePixActor, MercadoPagoLivePixView, RecoverMercadoPagoLivePixInput } from '../types/mercadoPagoLivePix.types.js';

export abstract class MercadoPagoLivePixReviewRepository {
  abstract read(actor: MercadoPagoLivePixActor): Promise<MercadoPagoLivePixView>;
  abstract recover(actor: MercadoPagoLivePixActor, input: RecoverMercadoPagoLivePixInput): Promise<MercadoPagoLivePixView>;
}
