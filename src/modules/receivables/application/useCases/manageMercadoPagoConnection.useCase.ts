import type { MercadoPagoConnectionRepository } from '../ports/mercadoPagoConnectionRepository.port.js';
import type { MercadoPagoCompletionInput, MercadoPagoConnectionActor } from '../types/mercadoPagoConnection.types.js';

export class ManageMercadoPagoConnectionUseCase {
  constructor(private readonly repository: MercadoPagoConnectionRepository) {}

  read(actor: MercadoPagoConnectionActor) {
    return this.repository.read(actor);
  }

  start(actor: MercadoPagoConnectionActor) {
    return this.repository.start(actor);
  }

  complete(actor: Omit<MercadoPagoConnectionActor, 'organizationId'>, input: MercadoPagoCompletionInput) {
    return this.repository.complete(actor, input);
  }

  disconnect(actor: MercadoPagoConnectionActor) {
    return this.repository.disconnect(actor);
  }
}
