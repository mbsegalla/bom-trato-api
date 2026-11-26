import type { MercadoPagoSandboxPixRecoveryRepository } from '../ports/mercadoPagoSandboxPixRecoveryRepository.port.js';
import type { MercadoPagoSandboxPixActor } from '../types/mercadoPagoSandboxPix.types.js';
import type { RecoverMercadoPagoSandboxPixInput } from '../types/mercadoPagoSandboxPixRecovery.types.js';

export class ManageMercadoPagoSandboxPixRecoveryUseCase {
  constructor(private readonly repository: MercadoPagoSandboxPixRecoveryRepository) {}

  read(actor: MercadoPagoSandboxPixActor) {
    return this.repository.read(actor);
  }

  recover(actor: MercadoPagoSandboxPixActor, input: RecoverMercadoPagoSandboxPixInput) {
    return this.repository.recover(actor, input);
  }
}
