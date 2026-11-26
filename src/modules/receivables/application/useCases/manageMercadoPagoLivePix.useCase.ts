import type { MercadoPagoLivePixRepository } from '../ports/mercadoPagoLivePixRepository.port.js';
import type { MercadoPagoLivePixReviewRepository } from '../ports/mercadoPagoLivePixReviewRepository.port.js';
import type { IssueMercadoPagoLivePixInput, MercadoPagoLivePixActor, RecoverMercadoPagoLivePixInput } from '../types/mercadoPagoLivePix.types.js';
import { ReceivingSettingsError } from '../../domain/errors/receivingSettings.error.js';

export class ManageMercadoPagoLivePixUseCase {
  constructor(
    private readonly issuer: MercadoPagoLivePixRepository,
    private readonly review: MercadoPagoLivePixReviewRepository,
  ) {}

  read(actor: MercadoPagoLivePixActor) {
    return this.review.read(actor);
  }

  async issue(actor: MercadoPagoLivePixActor, input: IssueMercadoPagoLivePixInput) {
    const current = await this.review.read(actor);
    if (current.issuanceId !== null) return current;
    if (!current.canIssue) throw new ReceivingSettingsError('MERCADO_PAGO_UNAVAILABLE');
    if (current.receivableVersion !== input.version) throw new ReceivingSettingsError('MERCADO_PAGO_PIX_CONFLICT');
    await this.issuer.issue(actor, input);
    return this.review.read(actor);
  }

  recover(actor: MercadoPagoLivePixActor, input: RecoverMercadoPagoLivePixInput) {
    return this.review.recover(actor, input);
  }
}
