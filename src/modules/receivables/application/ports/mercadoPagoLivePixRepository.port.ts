import type {
  IssueMercadoPagoLivePixInput,
  MercadoPagoLivePixActor,
  MercadoPagoLivePixIssuance,
} from '../types/mercadoPagoLivePix.types.js';

export abstract class MercadoPagoLivePixRepository {
  abstract issue(
    actor: MercadoPagoLivePixActor,
    input: IssueMercadoPagoLivePixInput,
  ): Promise<MercadoPagoLivePixIssuance>;
}
