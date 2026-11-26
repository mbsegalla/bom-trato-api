import type {
  MercadoPagoCompletionInput,
  MercadoPagoCompletionView,
  MercadoPagoConnectionActor,
  MercadoPagoConnectionView,
  MercadoPagoStartView,
} from '../types/mercadoPagoConnection.types.js';

export abstract class MercadoPagoConnectionRepository {
  abstract read(actor: MercadoPagoConnectionActor): Promise<MercadoPagoConnectionView>;
  abstract start(actor: MercadoPagoConnectionActor): Promise<MercadoPagoStartView>;
  abstract complete(
    actor: Omit<MercadoPagoConnectionActor, 'organizationId'>,
    input: MercadoPagoCompletionInput,
  ): Promise<MercadoPagoCompletionView>;
  abstract disconnect(actor: MercadoPagoConnectionActor): Promise<void>;
}
