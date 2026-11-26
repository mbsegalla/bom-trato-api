import type { MercadoPagoSandboxPixActor } from '../types/mercadoPagoSandboxPix.types.js';
import type {
  MercadoPagoSandboxPixRecoveryView,
  RecoverMercadoPagoSandboxPixInput,
} from '../types/mercadoPagoSandboxPixRecovery.types.js';

export abstract class MercadoPagoSandboxPixRecoveryRepository {
  abstract read(actor: MercadoPagoSandboxPixActor): Promise<MercadoPagoSandboxPixRecoveryView>;
  abstract recover(
    actor: MercadoPagoSandboxPixActor,
    input: RecoverMercadoPagoSandboxPixInput,
  ): Promise<MercadoPagoSandboxPixRecoveryView>;
}
