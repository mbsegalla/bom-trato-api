import type {
  CreateMercadoPagoSandboxPixInput,
  MercadoPagoSandboxPixActor,
  MercadoPagoSandboxPixView,
} from '../types/mercadoPagoSandboxPix.types.js';

export abstract class MercadoPagoSandboxPixRepository {
  abstract read(actor: MercadoPagoSandboxPixActor): Promise<MercadoPagoSandboxPixView>;
  abstract issue(actor: MercadoPagoSandboxPixActor, input: CreateMercadoPagoSandboxPixInput): Promise<MercadoPagoSandboxPixView>;
}
