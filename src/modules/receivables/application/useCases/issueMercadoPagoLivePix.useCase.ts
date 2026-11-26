import type { MercadoPagoLivePixRepository } from '../ports/mercadoPagoLivePixRepository.port.js';
import type { IssueMercadoPagoLivePixInput, MercadoPagoLivePixActor } from '../types/mercadoPagoLivePix.types.js';

// Internal issuer; release policy is enforced by the repository.
export class IssueMercadoPagoLivePixUseCase {
  constructor(private readonly repository: MercadoPagoLivePixRepository) {}

  execute(actor: MercadoPagoLivePixActor, input: IssueMercadoPagoLivePixInput) {
    return this.repository.issue(actor, input);
  }
}
