import type { MercadoPagoSandboxPixRepository } from '../ports/mercadoPagoSandboxPixRepository.port.js';
import type { CreateMercadoPagoSandboxPixInput, MercadoPagoSandboxPixActor } from '../types/mercadoPagoSandboxPix.types.js';

export class ManageMercadoPagoSandboxPixUseCase {
  constructor(private readonly repository: MercadoPagoSandboxPixRepository) {}

  read(actor: MercadoPagoSandboxPixActor) {
    return this.repository.read(actor);
  }

  issue(actor: MercadoPagoSandboxPixActor, input: CreateMercadoPagoSandboxPixInput) {
    return this.repository.issue(actor, input);
  }
}
